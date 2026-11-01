/**
 * เฉพาะ "พนักงานรายเดือน" (Indirect / Staff Monthly):
 * 1) ย้ายข้อมูลจากช่อง "ชื่อภาษาอื่น" (เช่น "Kanokwan Chunhachanachot") ไปแยกใส่
 *    "ชื่ออังกฤษ" (คำแรก) และ "นามสกุลอังกฤษ" (คำที่เหลือ) แทน
 * 2) ล้างค่าในช่อง "ชื่อภาษาอื่น" ออก (เก็บ field ไว้เฉยๆ เผื่อใช้ในอนาคต แต่ไม่ใช้แล้วสำหรับกลุ่มนี้)
 * 3) แก้ label ของ "ชื่ออังกฤษ"/"นามสกุลอังกฤษ" ใน schema emp_indirect ตัดคำว่า "ตัวพิมพ์ใหญ่" ออก
 *    (ไม่บังคับตัวพิมพ์ใหญ่แล้ว)
 *
 * สำรองค่าดั้งเดิมไว้ที่ exports/staff_monthly_other_name_backup.xlsx ก่อนเขียนทับ
 *
 * รัน: node src/scripts/migrateOtherNameToEnglishName.js
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
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

async function run() {
  console.log('\n=== โหลดข้อมูลพนักงานรายเดือน (Indirect) ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const indirectDocs = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id) && d.data().employee_type === 'Indirect');
  console.log(`พนักงานรายเดือนทั้งหมด: ${indirectDocs.length} คน`);

  const backupRows = [];
  let migrated = 0;
  let skippedAlreadyHasEnglish = 0;
  let skippedNoOtherName = 0;

  for (const d of indirectDocs) {
    const data = d.data();
    const otherName = String(data['ชื่อภาษาอื่น'] || '').trim();
    const existingEng = String(data['ชื่ออังกฤษ'] || '').trim();
    const existingEngLast = String(data['นามสกุลอังกฤษ'] || '').trim();

    if (!otherName) {
      skippedNoOtherName++;
      continue;
    }
    if (existingEng || existingEngLast) {
      console.log(`  ⚠️ ข้าม [${data['รหัสพนักงาน']}] มี ชื่ออังกฤษ/นามสกุลอังกฤษ อยู่แล้ว ("${existingEng}" "${existingEngLast}") - ไม่เขียนทับ`);
      skippedAlreadyHasEnglish++;
      continue;
    }

    const parts = otherName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    backupRows.push([
      String(data['รหัสพนักงาน'] || d.id),
      [data['ชื่อตัว'], data['ชื่อสกุล']].filter(Boolean).join(' '),
      otherName,
    ]);

    await updateDoc(d.ref, {
      ชื่ออังกฤษ: firstName,
      นามสกุลอังกฤษ: lastName,
      ชื่อภาษาอื่น: '',
    });
    migrated++;
    console.log(`  ✅ [${data['รหัสพนักงาน']}] "${otherName}" -> ชื่ออังกฤษ="${firstName}" นามสกุลอังกฤษ="${lastName}"`);
  }

  console.log(`\n✅ ย้ายข้อมูลสำเร็จ: ${migrated} คน`);
  console.log(`⚠️ ข้าม (มี ชื่ออังกฤษ อยู่แล้ว): ${skippedAlreadyHasEnglish} คน`);
  console.log(`⚠️ ข้าม (ไม่มี ชื่อภาษาอื่น เลย): ${skippedNoOtherName} คน`);

  if (backupRows.length > 0) {
    const outDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const ws = XLSX.utils.aoa_to_sheet([
      ['รหัสพนักงาน', 'ชื่อ-สกุล (ไทย)', 'ชื่อภาษาอื่น (ก่อนย้าย)'],
      ...backupRows,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'backup');
    XLSX.writeFile(wb, path.join(outDir, 'staff_monthly_other_name_backup.xlsx'));
    console.log(`\n✅ สำรองค่าก่อนย้ายไว้ที่: exports/staff_monthly_other_name_backup.xlsx`);
  }

  // แก้ label ของ schema emp_indirect: ตัดคำว่า "ตัวพิมพ์ใหญ่" ออก (ไม่บังคับตัวพิมพ์ใหญ่แล้ว)
  console.log('\n=== แก้ label schema emp_indirect (ตัดข้อความ "ตัวพิมพ์ใหญ่" ออก) ===\n');
  const schemaRef = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_indirect');
  const schemaSnap = await getDoc(schemaRef);
  if (schemaSnap.exists()) {
    const fields = schemaSnap.data().fields || [];
    const newFields = fields.map((f) => {
      if (f && f.id === 'ชื่ออังกฤษ') return { ...f, label: 'ชื่อ (ภาษาอังกฤษ)' };
      if (f && f.id === 'นามสกุลอังกฤษ') return { ...f, label: 'นามสกุล (ภาษาอังกฤษ)' };
      return f;
    });
    await setDoc(schemaRef, { fields: newFields }, { merge: true });
    console.log('✅ อัปเดต label สำเร็จ: "ชื่อ (ภาษาอังกฤษ)" / "นามสกุล (ภาษาอังกฤษ)"');
  }

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
