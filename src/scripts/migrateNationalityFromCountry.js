/**
 * สคริปต์ย้ายข้อมูลจากฟิลด์ "ประเทศ" (มีอยู่แล้วในข้อมูลพนักงาน) มาเติมฟิลด์ "สัญชาติ"
 * ที่ dashboard ใช้แสดงกราฟสัดส่วน Thai/Foreigner
 *
 * กติกา:
 *   - คัดลอกค่า "ประเทศ" (trim) ไปเป็น "สัญชาติ" ตรงๆ เช่น "ไทย" -> "ไทย", "พม่า" -> "พม่า"
 *     (ไม่ normalize เป็น "ต่างชาติ" เพื่อคงชื่อประเทศ/สัญชาติจริงไว้)
 *   - dashboard จะถือว่าค่า "ไทย"/"thai"/"th" = คนไทย ส่วนค่าอื่นทั้งหมด (พม่า, ไทยใหญ่, ฯลฯ) = ต่างชาติ โดยอัตโนมัติ
 *   - ถ้า "ประเทศ" ว่าง -> ข้าม ไม่แก้ "สัญชาติ" (ปล่อยว่างไว้ให้กรอกเพิ่มทีหลัง)
 *   - เขียนทับค่าเดิมใน "สัญชาติ" เสมอ (แม้มีค่าอยู่แล้ว) เพราะพบว่าค่าเดิมหลายรายการ
 *     เป็นข้อมูลผิดฟิลด์ (เช่น ชื่อโรงพยาบาล) ไม่ใช่สัญชาติจริง
 *   - ข้าม document "_schema_metadata"
 *
 * โหมด dry-run (ค่าเริ่มต้น): แสดงรายการที่จะแก้ไข โดยยังไม่เขียนข้อมูลจริง
 *   node src/scripts/migrateNationalityFromCountry.js
 * โหมดเขียนจริง:
 *   node src/scripts/migrateNationalityFromCountry.js --confirm
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
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

function mapNationality(countryRaw) {
  const country = String(countryRaw || '').trim();
  if (!country) return null; // ไม่มีข้อมูลประเทศ -> ไม่แก้ไข
  return country; // คัดลอกชื่อประเทศ/สัญชาติตรงๆ ไม่ normalize
}

async function run() {
  const confirm = process.argv.includes('--confirm');
  console.log(`\n=== ย้ายข้อมูล "ประเทศ" -> "สัญชาติ" ===`);
  console.log(`โหมด: ${confirm ? '🚀 เขียนจริง (--confirm)' : '🔍 DRY-RUN (แสดงผลอย่างเดียว)'}\n`);

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  console.log(`โหลดพนักงานทั้งหมด: ${snap.size} เอกสาร\n`);

  const toUpdate = [];
  const skippedNoCountry = [];
  let unchangedSameValue = 0;

  snap.docs.forEach((docSnap) => {
    if (SKIP_DOC_IDS.has(docSnap.id)) return;
    const data = docSnap.data();
    const countryRaw = data['ประเทศ'];
    const currentNationality = String(data['สัญชาติ'] || '').trim();
    const newNationality = mapNationality(countryRaw);

    if (newNationality === null) {
      skippedNoCountry.push({
        id: docSnap.id,
        code: String(data['รหัสพนักงาน'] || docSnap.id),
        name: fullName(data),
        currentNationality: currentNationality || '(ว่าง)',
      });
      return;
    }

    if (newNationality === currentNationality) {
      unchangedSameValue++;
      return;
    }

    toUpdate.push({
      id: docSnap.id,
      code: String(data['รหัสพนักงาน'] || docSnap.id),
      name: fullName(data),
      country: String(countryRaw).trim(),
      currentNationality: currentNationality || '(ว่าง)',
      newNationality,
    });
  });

  console.log(`=== สรุปผล ===`);
  console.log(`จะอัปเดต "สัญชาติ": ${toUpdate.length} คน`);
  console.log(`  -> เป็น "ไทย": ${toUpdate.filter((r) => r.newNationality === 'ไทย').length} คน`);
  console.log(`  -> เป็น "ต่างชาติ": ${toUpdate.filter((r) => r.newNationality === 'ต่างชาติ').length} คน`);
  console.log(`ค่าตรงกับปัจจุบันอยู่แล้ว (ไม่ต้องแก้): ${unchangedSameValue} คน`);
  console.log(`ไม่มีข้อมูล "ประเทศ" จึงข้าม (ยังปล่อย "สัญชาติ" ไว้ตามเดิม): ${skippedNoCountry.length} คน\n`);

  const withGarbageNationality = skippedNoCountry.filter(
    (r) => r.currentNationality !== '(ว่าง)' && r.currentNationality !== 'ไทย' && r.currentNationality !== 'ต่างชาติ'
  );
  if (withGarbageNationality.length > 0) {
    console.log(`⚠️  พบคนที่ไม่มี "ประเทศ" แต่ "สัญชาติ" มีค่าผิดปกติ (ไม่ใช่ไทย/ต่างชาติ) ต้องตรวจสอบเอง: ${withGarbageNationality.length} คน`);
    withGarbageNationality.forEach((r) => console.log(`  [${r.code}] ${r.name} | สัญชาติปัจจุบัน: "${r.currentNationality}"`));
    console.log('');
  }

  // เขียนไฟล์ CSV เพื่อตรวจสอบ
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const writeCsv = (file, header, rows) => {
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
    fs.writeFileSync(path.join(outDir, file), '\ufeff' + lines.join('\r\n'), 'utf8');
    console.log(`📝 บันทึก: exports/${file} (${rows.length} แถว)`);
  };

  writeCsv(
    'nationality_migration_plan.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'ประเทศ (ต้นทาง)', 'สัญชาติเดิม', 'สัญชาติใหม่'],
    toUpdate.map((r) => [r.code, r.name, r.country, r.currentNationality, r.newNationality])
  );

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
        สัญชาติ: r.newNationality,
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
