/**
 * Export ข้อมูลพนักงานกลุ่ม "Supply manpower" และ "Sub contractor" (ทุกฟิลด์ปัจจุบันตาม schema)
 * ออกเป็นไฟล์ Excel (.xlsx) เก็บไว้ที่เครื่อง (โฟลเดอร์ exports/) เพื่อให้ HR เปิดกรอก/แก้ไขข้อมูล
 * (เช่น ฟิลด์ใหม่ "บริษัทผู้รับเหมา") แล้วนำกลับมา Import เข้าระบบผ่านปุ่ม Import ในหน้าเว็บได้
 *
 * รัน: node src/scripts/exportSupplySubContractorData.js
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');
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
// ไม่ต้อง export ฟิลด์เหล่านี้ (ใช้ภายใน/ไม่เกี่ยวกับการกรอกข้อมูล)
const EXCLUDE_FIELD_IDS = new Set(['employee_type']);

const GROUPS = [
  {
    key: 'Direct_SupplyDC',
    label: 'Supply manpower',
    match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t),
  },
  {
    key: 'Direct_SubContractor',
    label: 'Sub contractor',
    match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t),
  },
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
  console.log('\n=== โหลด schema ปัจจุบัน (emp_direct_leader — ใช้ร่วมกับ Supply manpower / Sub contractor) ===\n');
  const schemaSnap = await getDoc(doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_direct_leader'));
  const allFields = (schemaSnap.data()?.fields || [])
    .map((f) => ({ id: f.id, label: f.label }))
    .filter((f) => !EXCLUDE_FIELD_IDS.has(f.id));
  console.log(`- จำนวนฟิลด์ทั้งหมด: ${allFields.length}`);

  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const employees = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id)).map((d) => d.data());
  console.log(`พนักงานทั้งหมดในระบบ: ${employees.length} คน`);

  const wb = XLSX.utils.book_new();

  for (const g of GROUPS) {
    const groupEmployees = employees
      .filter((e) => classify(e) === g.key)
      .sort((a, b) => String(a['รหัสพนักงาน'] || '').localeCompare(String(b['รหัสพนักงาน'] || ''), 'th'));

    console.log(`- ${g.label}: ${groupEmployees.length} คน`);
    if (groupEmployees.length === 0) continue;

    const header = ['ลำดับ', ...allFields.map((f) => f.label)];
    const aoa = [header];
    groupEmployees.forEach((emp, idx) => {
      const row = [
        idx + 1,
        ...allFields.map((f) => {
          const v = emp[f.id];
          return Array.isArray(v) ? v.join('|') : (v ?? '');
        }),
      ];
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, g.label.slice(0, 31));
  }

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'supply_manpower_sub_contractor_export.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✅ สร้างไฟล์สำเร็จ: ${outPath}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
