/**
 * สคริปต์ (read-only) แสดงรายชื่อพนักงานที่ยังไม่มีข้อมูล "เพศ" และ "สัญชาติ" แยกกัน 2 รายการ
 * (นับเฉพาะพนักงานที่สถานะ "ทำงาน" เหมือนที่ dashboard ใช้)
 *
 * รัน: node src/scripts/listMissingGenderNationality.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

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

function fullName(data) {
  return (
    [data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || String(data['รหัสพนักงาน'] || '')
  );
}

async function run() {
  console.log('\n=== รายชื่อพนักงาน (สถานะทำงาน) ที่ยังไม่มี "เพศ" / "สัญชาติ" ===\n');

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const activeEmployees = snap.docs
    .filter((docSnap) => !SKIP_DOC_IDS.has(docSnap.id))
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((emp) => emp['สถานะพนักงาน'] === 'ทำงาน');

  console.log(`พนักงานสถานะทำงานทั้งหมด: ${activeEmployees.length} คน\n`);

  const missingGender = activeEmployees.filter((emp) => {
    const g = String(emp.gender || emp['เพศ'] || '').trim();
    return !g;
  });

  const missingNationality = activeEmployees.filter((emp) => {
    const n = String(emp['สัญชาติ'] || '').trim();
    return !n;
  });

  const rowsFor = (list) =>
    list
      .map((emp) => ({
        code: String(emp['รหัสพนักงาน'] || emp.id),
        name: fullName(emp),
        project: Array.isArray(emp['สถานะโครงการ'])
          ? emp['สถานะโครงการ'].join(', ')
          : String(emp['สถานะโครงการ'] || ''),
        position: String(emp['ตำแหน่ง'] || ''),
        employeeType: String(emp.employee_type || ''),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, 'th'));

  const genderRows = rowsFor(missingGender);
  const nationalityRows = rowsFor(missingNationality);

  console.log(`=== 1) ไม่มีข้อมูล "เพศ": ${genderRows.length} คน ===`);
  genderRows.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: ${r.position || '-'} | โครงการ: ${r.project || '-'}`));

  console.log(`\n=== 2) ไม่มีข้อมูล "สัญชาติ": ${nationalityRows.length} คน ===`);
  nationalityRows.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: ${r.position || '-'} | โครงการ: ${r.project || '-'}`));

  // เขียนไฟล์ CSV แยก 2 ไฟล์
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const writeCsv = (file, header, rows) => {
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
    fs.writeFileSync(path.join(outDir, file), '\ufeff' + lines.join('\r\n'), 'utf8');
    console.log(`\n📝 บันทึก: exports/${file} (${rows.length} แถว)`);
  };

  writeCsv(
    'missing_gender.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง', 'employee_type', 'โครงการ'],
    genderRows.map((r) => [r.code, r.name, r.position, r.employeeType, r.project])
  );
  writeCsv(
    'missing_nationality.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง', 'employee_type', 'โครงการ'],
    nationalityRows.map((r) => [r.code, r.name, r.position, r.employeeType, r.project])
  );

  console.log('');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
