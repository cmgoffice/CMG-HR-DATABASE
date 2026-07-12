/**
 * สคริปต์เปลี่ยน "ตำแหน่ง" ของพนักงานที่ปัจจุบันตำแหน่ง = "worker"
 *   - เพศชาย  -> "ช่างไม้/ช่างปูน"
 *   - เพศหญิง -> "ผู้ช่วยช่าง"
 *
 * โหมด dry-run (ค่าเริ่มต้น): แสดงรายการที่จะแก้ไข โดยยังไม่เขียนข้อมูลจริง
 * โหมดเขียนจริง: เพิ่ม flag --confirm
 *
 *   node src/scripts/updateWorkerPositions.js            (dry-run)
 *   node src/scripts/updateWorkerPositions.js --confirm  (เขียนจริง)
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// ใช้ config เดียวกับแอป (fallback ใน src/App.tsx)
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

const MALE_POSITION = 'ช่างไม้/ช่างปูน';
const FEMALE_POSITION = 'ผู้ช่วยช่าง';

// อนุมานเพศจาก field เพศ/gender และ fallback จากคำนำหน้าชื่อ
function inferGender(data) {
  const explicit = String(data['เพศ'] || data.gender || '').trim().toLowerCase();
  if (explicit === 'male' || explicit === 'ชาย' || explicit === 'm') return 'ชาย';
  if (explicit === 'female' || explicit === 'หญิง' || explicit === 'f') return 'หญิง';

  const title = String(data['ชื่อต้น'] || '').trim().toLowerCase();
  if (title === 'นาย' || title === 'mr.' || title === 'mr') return 'ชาย';
  if (['นาง', 'นางสาว', 'น.ส.', 'mrs.', 'ms.', 'mrs', 'ms'].includes(title)) return 'หญิง';
  return 'ไม่ระบุ';
}

function fullName(data) {
  return [data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ') || String(data['รหัสพนักงาน'] || '');
}

async function run() {
  const confirm = process.argv.includes('--confirm');
  console.log(`\n=== เปลี่ยนตำแหน่ง worker ===`);
  console.log(`โหมด: ${confirm ? '🚀 เขียนจริง (--confirm)' : '🔍 DRY-RUN (แสดงผลอย่างเดียว)'}\n`);

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  console.log(`โหลดพนักงานทั้งหมด: ${snap.size} คน\n`);

  const toUpdate = [];
  const skippedUnknownGender = [];

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const position = String(data['ตำแหน่ง'] || '').trim().toLowerCase();
    if (position !== 'worker') return;

    const gender = inferGender(data);
    const newPosition = gender === 'ชาย' ? MALE_POSITION : gender === 'หญิง' ? FEMALE_POSITION : null;

    const record = {
      id: docSnap.id,
      code: String(data['รหัสพนักงาน'] || docSnap.id),
      name: fullName(data),
      gender,
      newPosition,
    };

    if (!newPosition) {
      skippedUnknownGender.push(record);
      return;
    }
    toUpdate.push(record);
  });

  const males = toUpdate.filter((r) => r.gender === 'ชาย');
  const females = toUpdate.filter((r) => r.gender === 'หญิง');

  console.log(`ผู้ที่ตำแหน่ง = "worker" และจะแก้ไข: ${toUpdate.length} คน`);
  console.log(`  - ชาย  -> "${MALE_POSITION}": ${males.length} คน`);
  console.log(`  - หญิง -> "${FEMALE_POSITION}": ${females.length} คน`);
  console.log(`  - เพศไม่ระบุ (ข้าม): ${skippedUnknownGender.length} คน\n`);

  const printList = (label, list) => {
    if (list.length === 0) return;
    console.log(`--- ${label} ---`);
    list.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. [${r.code}] ${r.name}  ->  ${r.newPosition}`));
    console.log('');
  };

  printList(`ชาย (${males.length})`, males);
  printList(`หญิง (${females.length})`, females);

  if (skippedUnknownGender.length > 0) {
    console.log(`--- ข้าม: เพศไม่ระบุ (${skippedUnknownGender.length}) ---`);
    skippedUnknownGender.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. [${r.code}] ${r.name}`));
    console.log('');
  }

  // เขียนไฟล์ CSV เพื่อให้ตรวจ/เติมข้อมูลได้ง่าย
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const writeCsv = (file, header, rows) => {
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
    // ใส่ BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง
    fs.writeFileSync(path.join(outDir, file), '\ufeff' + lines.join('\r\n'), 'utf8');
    console.log(`📝 บันทึก: exports/${file} (${rows.length} แถว)`);
  };

  writeCsv(
    'worker_positions_all.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'เพศ', 'ตำแหน่งใหม่'],
    [...males, ...females, ...skippedUnknownGender].map((r) => [r.code, r.name, r.gender, r.newPosition || '(ข้าม - เพศไม่ระบุ)'])
  );
  writeCsv('worker_male.csv', ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่งใหม่'], males.map((r) => [r.code, r.name, r.newPosition]));
  writeCsv('worker_female.csv', ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่งใหม่'], females.map((r) => [r.code, r.name, r.newPosition]));
  writeCsv('worker_unknown_gender.csv', ['รหัสพนักงาน', 'ชื่อ', 'เพศ (เติมเอง)'], skippedUnknownGender.map((r) => [r.code, r.name, '']));
  console.log('');

  if (!confirm) {
    console.log('ℹ️  DRY-RUN เท่านั้น ยังไม่เขียนข้อมูล ใช้ --confirm เพื่อเขียนจริง\n');
    return;
  }

  console.log('🚀 เริ่มเขียนข้อมูล...\n');
  let ok = 0;
  let fail = 0;
  for (const r of toUpdate) {
    try {
      await updateDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', r.id), {
        'ตำแหน่ง': r.newPosition,
      });
      ok++;
    } catch (err) {
      fail++;
      console.error(`❌ [${r.code}] ${r.name}:`, err.message);
    }
  }
  console.log(`\n🎉 เสร็จสิ้น! สำเร็จ ${ok} คน / ล้มเหลว ${fail} คน\n`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
