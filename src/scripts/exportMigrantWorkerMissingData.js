/**
 * ตรวจสอบข้อมูล "แรงงานต่างด้าว" (migrant_documents / migrant_insurance / migrant_employer)
 * ที่เพิ่งเพิ่มเข้าระบบ โดยใช้กติกาเดียวกับหน้า "ติดตามเอกสารแรงงานต่างด้าว" ในแอป:
 *   - สัญชาติ != ไทย (และสถานะพนักงาน = ทำงาน) ถือว่าเป็นแรงงานต่างด้าวที่ต้องติดตาม
 *   - เอกสารกลุ่ม "ใบอนุญาตทำงาน/บัตรอนุญาตทำงาน" (work_permit หรือ permit_card) = ต้องมีอย่างน้อย 1 อย่าง (critical)
 *   - เอกสารกลุ่ม "พาสปอร์ต/เล่ม CI" (passport หรือ ci_book) = ควรมีอย่างน้อย 1 อย่าง (recommended)
 *   - ประกัน (migrant_insurance.types) = ควรมีอย่างน้อย 1 ประเภท
 *   - นายจ้าง (migrant_employer.type) = ควรระบุ
 *
 * เอกสารแต่ละรายการถือว่า "มี" ก็ต่อเมื่อมีทั้งเลขที่เอกสาร + วันหมดอายุ (ตามตรรกะในแอป)
 *
 * รัน: node src/scripts/exportMigrantWorkerMissingData.js
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

const THAI_NATIONALITY_ALIASES = ['ไทย', 'thai', 'thailand'];
const isMigrantWorker = (nationality) => {
  const v = String(nationality || '').trim();
  if (!v) return false;
  return !THAI_NATIONALITY_ALIASES.includes(v.toLowerCase());
};

const hasDocData = (entry) => !!entry && !!String(entry.docNumber || '').trim() && !!String(entry.expiryDate || '').trim();

const GROUPS = [
  { key: 'Indirect', label: 'Staff Monthly', match: (t) => t === 'Indirect' },
  { key: 'Direct_TeamLeader', label: 'DC Daily', match: (t) => ['Direct_TeamLeader', 'Direct: Team Leader', 'Direct - Team Leader'].includes(t) },
  { key: 'Direct_SupplyDC', label: 'Supply manpower', match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t) },
  { key: 'Direct_SubContractor', label: 'Sub contractor', match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t) },
];
function classify(emp) {
  const t = String(emp.employee_type || '').trim();
  for (const g of GROUPS) if (g.match(t)) return g.key;
  return 'อื่นๆ';
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
  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const employees = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id)).map((d) => d.data());
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  const activeMigrants = employees.filter(
    (e) => isMigrantWorker(e['สัญชาติ']) && String(e['สถานะพนักงาน'] || '') === 'ทำงาน'
  );
  console.log(`แรงงานต่างด้าวที่สถานะ "ทำงาน": ${activeMigrants.length} คน`);

  const rows = activeMigrants.map((emp) => {
    const docs = emp.migrant_documents || {};
    const hasWorkPermit = hasDocData(docs.work_permit);
    const hasPermitCard = hasDocData(docs.permit_card);
    const hasPassport = hasDocData(docs.passport);
    const hasCiBook = hasDocData(docs.ci_book);

    const workAuthOk = hasWorkPermit || hasPermitCard; // critical
    const identityOk = hasPassport || hasCiBook; // recommended

    const insuranceTypes = (emp.migrant_insurance && emp.migrant_insurance.types) || [];
    const insuranceOk = Array.isArray(insuranceTypes) && insuranceTypes.length > 0;

    const employerType = emp.migrant_employer && emp.migrant_employer.type;
    const employerOk = !!employerType;

    const missingList = [];
    if (!workAuthOk) missingList.push('ใบอนุญาตทำงาน/บัตรอนุญาตทำงาน (จำเป็น)');
    if (!identityOk) missingList.push('พาสปอร์ต/เล่ม CI (แนะนำ)');
    if (!insuranceOk) missingList.push('ประกัน (สังคม/กลุ่ม/อื่นๆ)');
    if (!employerOk) missingList.push('นายจ้าง (CMG/อื่นๆ)');

    return {
      emp,
      group: classify(emp),
      workAuthOk,
      identityOk,
      insuranceOk,
      employerOk,
      insuranceTypes,
      employerType: employerType || '',
      missingCount: missingList.length,
      missingList,
    };
  });

  const totalMissingWorkAuth = rows.filter((r) => !r.workAuthOk).length;
  const totalMissingIdentity = rows.filter((r) => !r.identityOk).length;
  const totalMissingInsurance = rows.filter((r) => !r.insuranceOk).length;
  const totalMissingEmployer = rows.filter((r) => !r.employerOk).length;

  console.log('\n=== สรุปภาพรวม (เฉพาะแรงงานต่างด้าวที่ทำงานอยู่) ===');
  console.log(`- ขาดใบอนุญาตทำงาน/บัตรอนุญาตทำงาน (ยังทำงานไม่ได้ตามกฎหมาย): ${totalMissingWorkAuth} คน`);
  console.log(`- ขาดพาสปอร์ต/เล่ม CI (ขาดเอกสารยืนยันตัวตน): ${totalMissingIdentity} คน`);
  console.log(`- ยังไม่ระบุประกัน: ${totalMissingInsurance} คน`);
  console.log(`- ยังไม่ระบุนายจ้าง: ${totalMissingEmployer} คน`);

  const rowsWithMissing = rows.filter((r) => r.missingCount > 0);
  console.log(`\nรวมคนที่ขาดอย่างน้อย 1 รายการ: ${rowsWithMissing.length} / ${rows.length} คน`);

  // --- สร้างไฟล์ Excel ---
  const wb = XLSX.utils.book_new();
  const redFill = { fgColor: { rgb: 'FFF4CCCC' } };
  const yellowFill = { fgColor: { rgb: 'FFFFF2CC' } };

  const groupLabels = { Indirect: 'Staff Monthly', Direct_TeamLeader: 'DC Daily', Direct_SupplyDC: 'Supply manpower', Direct_SubContractor: 'Sub contractor' };

  for (const groupKey of Object.keys(groupLabels)) {
    const groupRows = rowsWithMissing
      .filter((r) => r.group === groupKey)
      .sort((a, b) => b.missingCount - a.missingCount || String(a.emp['รหัสพนักงาน']).localeCompare(String(b.emp['รหัสพนักงาน']), 'th'));
    if (groupRows.length === 0) {
      console.log(`- ${groupLabels[groupKey]}: ข้อมูลแรงงานต่างด้าวครบทุกคนแล้ว ✅`);
      continue;
    }

    const header = [
      'รหัสพนักงาน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'สัญชาติ', 'จำนวนรายการที่ขาด',
      'ใบอนุญาตทำงาน/บัตรอนุญาตทำงาน', 'พาสปอร์ต/เล่ม CI', 'ประกัน', 'นายจ้าง', 'รายละเอียดที่ขาด',
    ];
    const aoa = [header];
    groupRows.forEach((r) => {
      aoa.push([
        String(r.emp['รหัสพนักงาน'] || ''),
        fullName(r.emp),
        String(r.emp['ตำแหน่ง'] || ''),
        String(r.emp['สัญชาติ'] || ''),
        r.missingCount,
        r.workAuthOk ? 'มีแล้ว ✅' : 'ไม่มี ❌',
        r.identityOk ? 'มีแล้ว ✅' : 'ไม่มี',
        r.insuranceOk ? r.insuranceTypes.join(', ') : 'ไม่มี',
        r.employerOk ? r.employerType : 'ไม่มี',
        r.missingList.join(' / '),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((_, i) => ({ wch: i === 1 ? 26 : i === 9 ? 45 : 18 }));

    groupRows.forEach((r, rowIdx) => {
      if (!r.workAuthOk) {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 5 });
        ws[ref].s = { fill: redFill, font: { bold: true } };
      }
      if (!r.identityOk) {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 6 });
        ws[ref].s = { fill: yellowFill };
      }
      if (!r.insuranceOk) {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 7 });
        ws[ref].s = { fill: yellowFill };
      }
      if (!r.employerOk) {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 8 });
        ws[ref].s = { fill: yellowFill };
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, groupLabels[groupKey].slice(0, 31));
    console.log(`- ${groupLabels[groupKey]}: ${groupRows.length} คนที่ขาดข้อมูลแรงงานต่างด้าวบางรายการ`);
  }

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'employee_migrant_worker_missing_data.xlsx');
  XLSX.writeFile(wb, outPath, { cellStyles: true });
  console.log(`\n✅ สร้างไฟล์: ${outPath}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
