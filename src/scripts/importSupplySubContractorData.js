/**
 * อ่านไฟล์ exports/supply_manpower_sub_contractor_export.xlsx ที่ HR กรอก/แก้ไขข้อมูลแล้ว
 * แล้วอัปเดตกลับเข้า Firestore (employee_data) โดยจับคู่ด้วย "รหัสพนักงาน"
 * อ่านคอลัมน์แบบอิงตำแหน่ง (เรียงตาม schema ตอน export) เพื่อเลี่ยงปัญหา label ซ้ำกัน
 * (เช่น "วันที่ลาออก" มี 2 field id: วันที่ลาออก และ resignation_date)
 *
 * รัน: node src/scripts/importSupplySubContractorData.js
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, updateDoc } = require('firebase/firestore');
const XLSX = require('xlsx');

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'cmg-hr-database.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'cmg-hr-database',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'cmg-hr-database.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '625046761441',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:625046761441:web:22493e0b56a984cf5daca0',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SKIP_DOC_IDS = new Set(['_schema_metadata']);
const EXCLUDE_FIELD_IDS = new Set(['employee_type']);

const GROUPS = [
  { key: 'Direct_SupplyDC', label: 'Supply manpower', match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t) },
  { key: 'Direct_SubContractor', label: 'Sub contractor', match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t) },
];

function classify(emp) {
  const t = String(emp.employee_type || '').trim();
  for (const g of GROUPS) if (g.match(t)) return g.key;
  return null;
}

function fullName(data) {
  return (
    [data['คำนำหน้าชื่อ'] || data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || String(data['รหัสพนักงาน'] || '')
  );
}

async function run() {
  const srcPath = path.join(process.cwd(), 'exports', 'supply_manpower_sub_contractor_export.xlsx');
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ ไม่พบไฟล์: ${srcPath}`);
    process.exit(1);
  }

  console.log('\n=== โหลด schema ปัจจุบัน (emp_direct_leader) ===\n');
  const schemaSnap = await getDoc(doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_direct_leader'));
  const allFields = (schemaSnap.data()?.fields || [])
    .map((f) => ({ id: f.id, label: f.label }))
    .filter((f) => !EXCLUDE_FIELD_IDS.has(f.id));
  console.log(`- จำนวนฟิลด์ (ไม่รวม "ลำดับ"): ${allFields.length}`);

  console.log('\n=== โหลดข้อมูลพนักงานปัจจุบันจาก Firestore ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const docSnaps = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id));
  const employeesByCode = new Map();
  docSnaps.forEach((d) => {
    const data = d.data();
    const code = String(data['รหัสพนักงาน'] || d.id).trim();
    employeesByCode.set(code, { __id: d.id, ref: d.ref, ...data });
  });
  console.log(`พนักงานทั้งหมดในระบบ: ${employeesByCode.size} คน`);

  const wb = XLSX.readFile(srcPath);

  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalNotFound = 0;
  const notFoundIds = [];

  for (const g of GROUPS) {
    const sheet = wb.Sheets[g.label];
    if (!sheet) {
      console.log(`⚠️ ไม่พบชีท "${g.label}" ในไฟล์ (ข้าม)`);
      continue;
    }
    console.log(`\n=== ประมวลผลชีท: ${g.label} ===\n`);

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const header = rows[0];
    const dataRows = rows.slice(1);

    // header = ['ลำดับ', ...allFields.map(f => f.label)] ตามที่สคริปต์ export สร้างไว้
    // ใช้ตำแหน่งคอลัมน์ (index) อิงกับ allFields แทนชื่อ label เพื่อเลี่ยง label ซ้ำ
    const empIdColIdx = 1 + allFields.findIndex((f) => f.id === 'รหัสพนักงาน'); // +1 เพราะคอลัมน์ 0 คือ "ลำดับ"

    for (const row of dataRows) {
      if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;
      const empId = String(row[empIdColIdx] ?? '').trim();
      if (!empId) continue;

      const emp = employeesByCode.get(empId);
      if (!emp) {
        totalNotFound++;
        notFoundIds.push(empId);
        continue;
      }
      if (classify(emp) !== g.key) {
        // ข้อมูลในระบบเปลี่ยนกลุ่มไปแล้ว (เช่นย้ายกลุ่มงาน) — ยังอัปเดตได้ตามรหัสพนักงานปกติ
      }

      const payload = {};
      allFields.forEach((field, i) => {
        const colIdx = i + 1; // +1 เพราะคอลัมน์ 0 คือ "ลำดับ"
        if (colIdx === empIdColIdx) return; // ไม่ต้องเขียนทับรหัสพนักงาน (ใช้เป็น key)
        const rawVal = row[colIdx];
        const val = String(rawVal ?? '').trim();
        if (!val) return; // เว้นว่าง = ไม่แก้ไขของเดิม
        const currentVal = String(emp[field.id] ?? '').trim();
        if (val !== currentVal) {
          payload[field.id] = val;
        }
      });

      if (Object.keys(payload).length > 0) {
        await updateDoc(emp.ref, payload);
        Object.assign(emp, payload);
        totalUpdated++;
        console.log(`  ✅ [${empId}] ${fullName(emp)}:`, payload);
      } else {
        totalUnchanged++;
      }
    }
  }

  console.log(`\n=== สรุปผล ===`);
  console.log(`✅ อัปเดตสำเร็จ: ${totalUpdated} คน`);
  console.log(`➖ ไม่มีการเปลี่ยนแปลง: ${totalUnchanged} คน`);
  if (totalNotFound > 0) {
    console.log(`⚠️ ไม่พบรหัสพนักงานในระบบ: ${totalNotFound} รายการ -> ${notFoundIds.join(', ')}`);
  }
  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
