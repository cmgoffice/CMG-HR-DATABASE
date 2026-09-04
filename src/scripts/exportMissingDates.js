/**
 * สร้างไฟล์ Excel (.xlsx) แยก 2 ไฟล์ สำหรับพนักงานสถานะ "ทำงาน" ที่ยังไม่มีข้อมูล:
 *   1) exports/missing_date_of_birth.xlsx  -> ไม่มีข้อมูล "วันเกิด"
 *   2) exports/missing_start_date.xlsx     -> ไม่มีข้อมูล "วันที่เริ่มงาน"
 *
 * ใช้ logic เดียวกับที่ dashboard ใช้ตรวจสอบว่ามี/ไม่มีข้อมูล (ดู src/utils/employeeDates.ts)
 * คือเช็คทั้งฟิลด์ใหม่ (date_of_birth / start_date) และฟิลด์เก่าที่นำเข้าจาก Excel
 * (วันเกิดปีเดือนวัน_คศ, วันเกิด, วันที่เริ่มงาน_ปีเดือนวัน_คศ, วันเริ่มงาน)
 *
 * แต่ละไฟล์มีคอลัมน์ว่างสุดท้ายให้กรอกวันที่ใหม่ (รูปแบบ dd/mm/yyyy ค.ศ.)
 * แล้วนำไป import กลับเข้าระบบผ่านฟีเจอร์ "นำเข้า CSV/Excel" ได้เลย
 *
 * รัน: node src/scripts/exportMissingDates.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
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

// ---------- ตรรกะแปลง/ตรวจสอบวันที่ (mirror ของ src/utils/employeeDates.ts) ----------

const parseSlashDMY = (value) => {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
};

const parseCompactYMD = (value) => {
  const digits = String(value).trim();
  if (!/^\d{8}$/.test(digits)) return null;
  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  const day = parseInt(digits.slice(6, 8), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
};

const isPlausibleYear = (year) => year >= 1900 && year <= 2100;

const normalizeRawDate = (raw) => {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return str.slice(0, 10);

  const compact = parseCompactYMD(str);
  if (compact) {
    const ceYear = compact.year > 2400 ? compact.year - 543 : compact.year;
    return `${ceYear}-${String(compact.month).padStart(2, '0')}-${String(compact.day).padStart(2, '0')}`;
  }

  const slash = parseSlashDMY(str);
  if (slash) {
    const ceYear = slash.year > 2400 ? slash.year - 543 : slash.year;
    if (!isPlausibleYear(ceYear)) return null;
    return `${ceYear}-${String(slash.month).padStart(2, '0')}-${String(slash.day).padStart(2, '0')}`;
  }

  return null;
};

const DOB_FIELDS = ['date_of_birth', 'วันเกิดปีเดือนวัน_คศ', 'วันเกิด'];
const START_FIELDS = ['start_date', 'วันที่เริ่มงาน_ปีเดือนวัน_คศ', 'วันเริ่มงาน'];

const resolveDob = (emp) => {
  for (const f of DOB_FIELDS) {
    const v = normalizeRawDate(emp[f]);
    if (v) return v;
  }
  return null;
};

const resolveStart = (emp) => {
  for (const f of START_FIELDS) {
    const v = normalizeRawDate(emp[f]);
    if (v) return v;
  }
  return null;
};

function fullName(data) {
  return (
    [data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || String(data['รหัสพนักงาน'] || '')
  );
}

function writeXlsx(fileName, sheetName, header, rows) {
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 14 }, // รหัสพนักงาน
    { wch: 28 }, // ชื่อ
    { wch: 22 }, // ตำแหน่ง
    { wch: 20 }, // employee_type
    { wch: 30 }, // โครงการ
    { wch: 20 }, // คอลัมน์กรอกวันที่
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const outPath = path.join(outDir, fileName);
  XLSX.writeFile(wb, outPath);
  console.log(`✅ สร้าง exports/${fileName} (${rows.length} แถวข้อมูล)`);
  return outPath;
}

async function run() {
  console.log('\n=== รายชื่อพนักงาน (สถานะทำงาน) ที่ยังไม่มี "วันเกิด" / "วันที่เริ่มงาน" ===\n');

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const activeEmployees = snap.docs
    .filter((docSnap) => !SKIP_DOC_IDS.has(docSnap.id))
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((emp) => emp['สถานะพนักงาน'] === 'ทำงาน');

  console.log(`พนักงานสถานะทำงานทั้งหมด: ${activeEmployees.length} คน\n`);

  const missingDob = activeEmployees.filter((emp) => !resolveDob(emp));
  const missingStart = activeEmployees.filter((emp) => !resolveStart(emp));

  const rowsFor = (list) =>
    list
      .map((emp) => ({
        code: String(emp['รหัสพนักงาน'] || emp.id),
        name: fullName(emp),
        position: String(emp['ตำแหน่ง'] || ''),
        employeeType: String(emp.employee_type || ''),
        project: Array.isArray(emp['สถานะโครงการ'])
          ? emp['สถานะโครงการ'].join(', ')
          : String(emp['สถานะโครงการ'] || ''),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, 'th'));

  const dobRows = rowsFor(missingDob);
  const startRows = rowsFor(missingStart);

  console.log(`=== 1) ไม่มีข้อมูล "วันเกิด": ${dobRows.length} คน ===`);
  dobRows.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: ${r.position || '-'} | โครงการ: ${r.project || '-'}`));

  console.log(`\n=== 2) ไม่มีข้อมูล "วันที่เริ่มงาน": ${startRows.length} คน ===`);
  startRows.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: ${r.position || '-'} | โครงการ: ${r.project || '-'}`));

  writeXlsx(
    'missing_date_of_birth.xlsx',
    'ไม่มีวันเกิด',
    ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง', 'employee_type', 'โครงการ', 'วันเกิด (dd/mm/yyyy ค.ศ.)'],
    dobRows.map((r) => [r.code, r.name, r.position, r.employeeType, r.project, ''])
  );

  writeXlsx(
    'missing_start_date.xlsx',
    'ไม่มีวันเริ่มงาน',
    ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง', 'employee_type', 'โครงการ', 'วันที่เริ่มงาน (dd/mm/yyyy ค.ศ.)'],
    startRows.map((r) => [r.code, r.name, r.position, r.employeeType, r.project, ''])
  );

  console.log('');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
