/**
 * อ่านไฟล์ Excel ที่กรอก "เพศ" และ "สัญชาติ" เพิ่มแล้ว (จับคู่ด้วยคอลัมน์ "รหัสพนักงาน")
 * แล้วอัปเดตเข้า Firestore employee_data
 *
 * ไฟล์ที่อ่าน:
 *   C:\Users\sorra\Downloads\missing_gender.xlsx      (คอลัมน์ "เพศ": ชาย/หญิง)
 *   C:\Users\sorra\Downloads\missing_nationality.xlsx (คอลัมน์ "สัญชาติ": ไทย/เมียนมา/ฯลฯ)
 *
 * โหมด dry-run (ค่าเริ่มต้น): แสดงรายการที่จะแก้ไข โดยยังไม่เขียนข้อมูลจริง
 *   node src/scripts/applyGenderNationalityFromExcel.js
 * โหมดเขียนจริง:
 *   node src/scripts/applyGenderNationalityFromExcel.js --confirm
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
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

const GENDER_FILE = 'C:\\Users\\sorra\\Downloads\\missing_gender.xlsx';
const NATIONALITY_FILE = 'C:\\Users\\sorra\\Downloads\\missing_nationality.xlsx';

const VALID_GENDER = new Set(['ชาย', 'หญิง']);

function readSheetRows(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = rows[0].map((h) => String(h).trim());
  const codeIdx = header.indexOf('รหัสพนักงาน');
  const valueIdx = header.length - 1; // คอลัมน์สุดท้ายที่เพิ่มเข้ามา (เพศ/สัญชาติ)
  const valueLabel = header[valueIdx];
  const map = new Map();
  rows.slice(1).forEach((r) => {
    const code = String(r[codeIdx] ?? '').trim();
    const value = String(r[valueIdx] ?? '').trim();
    if (code && value) map.set(code, value);
  });
  return { map, valueLabel };
}

function fullName(data) {
  return (
    [data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || ''
  );
}

async function run() {
  const confirm = process.argv.includes('--confirm');
  console.log(`\n=== อัปเดต "เพศ" / "สัญชาติ" จากไฟล์ Excel ===`);
  console.log(`โหมด: ${confirm ? '🚀 เขียนจริง (--confirm)' : '🔍 DRY-RUN (แสดงผลอย่างเดียว)'}\n`);

  const { map: genderMap } = readSheetRows(GENDER_FILE);
  const { map: nationalityMap } = readSheetRows(NATIONALITY_FILE);
  console.log(`อ่านไฟล์ "เพศ": ${genderMap.size} รายการ`);
  console.log(`อ่านไฟล์ "สัญชาติ": ${nationalityMap.size} รายการ\n`);

  const invalidGender = [...genderMap.entries()].filter(([, v]) => !VALID_GENDER.has(v));
  if (invalidGender.length > 0) {
    console.log(`⚠️  พบค่า "เพศ" ที่ไม่ใช่ "ชาย"/"หญิง" จำนวน ${invalidGender.length} รายการ (จะยังคงเขียนตามค่าที่กรอกมา):`);
    invalidGender.forEach(([code, v]) => console.log(`  [${code}] "${v}"`));
    console.log('');
  }

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const docsByCode = new Map();
  snap.docs.forEach((d) => {
    if (SKIP_DOC_IDS.has(d.id)) return;
    const data = d.data();
    const code = String(data['รหัสพนักงาน'] || d.id);
    docsByCode.set(code, { id: d.id, data });
  });

  const genderUpdates = [];
  const genderNotFound = [];
  genderMap.forEach((value, code) => {
    const found = docsByCode.get(code);
    if (!found) {
      genderNotFound.push(code);
      return;
    }
    const current = String(found.data['เพศ'] || '').trim();
    if (current === value) return;
    genderUpdates.push({ id: found.id, code, name: fullName(found.data), current: current || '(ว่าง)', newValue: value });
  });

  const nationalityUpdates = [];
  const nationalityNotFound = [];
  nationalityMap.forEach((value, code) => {
    const found = docsByCode.get(code);
    if (!found) {
      nationalityNotFound.push(code);
      return;
    }
    const current = String(found.data['สัญชาติ'] || '').trim();
    if (current === value) return;
    nationalityUpdates.push({ id: found.id, code, name: fullName(found.data), current: current || '(ว่าง)', newValue: value });
  });

  console.log(`=== เพศ: จะอัปเดต ${genderUpdates.length} คน (ไม่พบในระบบ ${genderNotFound.length} คน) ===`);
  if (genderNotFound.length > 0) console.log('  ไม่พบรหัส:', genderNotFound.join(', '));

  console.log(`\n=== สัญชาติ: จะอัปเดต ${nationalityUpdates.length} คน (ไม่พบในระบบ ${nationalityNotFound.length} คน) ===`);
  if (nationalityNotFound.length > 0) console.log('  ไม่พบรหัส:', nationalityNotFound.join(', '));

  console.log('');

  if (!confirm) {
    console.log('ℹ️  DRY-RUN เท่านั้น ยังไม่เขียนข้อมูล ใช้ --confirm เพื่อเขียนจริง\n');
    return;
  }

  console.log('🚀 เริ่มเขียนข้อมูล...\n');
  let ok = 0;
  let fail = 0;
  for (const u of genderUpdates) {
    try {
      await updateDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', u.id), { เพศ: u.newValue });
      ok++;
    } catch (err) {
      fail++;
      console.error(`❌ [เพศ] [${u.code}] ${u.name}:`, err.message);
    }
  }
  for (const u of nationalityUpdates) {
    try {
      await updateDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', u.id), { สัญชาติ: u.newValue });
      ok++;
    } catch (err) {
      fail++;
      console.error(`❌ [สัญชาติ] [${u.code}] ${u.name}:`, err.message);
    }
  }
  console.log(`\n🎉 เสร็จสิ้น! สำเร็จ ${ok} รายการ / ล้มเหลว ${fail} รายการ\n`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
