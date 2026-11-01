/**
 * ตรวจสอบที่อยู่เดิมของพนักงาน (จังหวัด/เขตอำเภอ/แขวงตำบล/ไปรษณีย์) เทียบกับฐานข้อมูล
 * เขตการปกครองไทยจริง (src/data/thailandAddress.ts) ว่า:
 *   - จังหวัดที่กรอกมีอยู่จริงหรือไม่
 *   - อำเภอที่กรอกอยู่ในจังหวัดนั้นจริงหรือไม่
 *   - ตำบลที่กรอกอยู่ในอำเภอนั้นจริงหรือไม่
 *   - รหัสไปรษณีย์ที่กรอกตรงกับของตำบลนั้นจริงหรือไม่ (พร้อมเฉลยรหัสที่ถูกต้อง)
 *
 * เช็คเฉพาะคนที่มีข้อมูลที่อยู่กรอกไว้แล้วอย่างน้อย 1 ช่อง (ไม่รวมคนที่ว่างเปล่าทั้งหมด
 * เพราะอยู่ในไฟล์ "ขอข้อมูลที่ขาด" อยู่แล้ว)
 *
 * Output: exports/employee_address_validation.xlsx
 *
 * รัน: node src/scripts/validateEmployeeAddresses.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const XLSX = require('xlsx');

// ใช้ข้อมูลเขตการปกครองชุดเดียวกับที่แอปใช้จริง (ดึงมาจาก src/data/thailandAddress.ts
// แล้ว export เป็น thailandAddress.json ไว้คู่กัน เพื่อให้สคริปต์ node ธรรมดา require ได้โดยตรง)
const { THAI_PROVINCES, THAI_DISTRICTS, THAI_SUB_DISTRICTS } = require('../data/thailandAddress.json');

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

const stripPrefix = (raw) =>
  String(raw || '')
    .trim()
    .replace(/^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)\s*/i, '')
    .trim();

function findProvince(storedName) {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  return THAI_PROVINCES.find((p) => p.name === storedName || stripPrefix(p.name) === core);
}
function findDistrict(storedName, provinceId, provinceName) {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  const pool = provinceId ? THAI_DISTRICTS.filter((d) => d.provinceId === provinceId) : THAI_DISTRICTS;
  let found = pool.find((d) => d.name === storedName || stripPrefix(d.name) === core);
  // เคสพิเศษ: "อ.เมือง" แบบย่อ ฐานข้อมูลจริงเก็บเป็น "เมือง" + ชื่อจังหวัด เช่น "เมืองระยอง"
  if (!found && core === 'เมือง' && provinceName) {
    const expected = 'เมือง' + stripPrefix(provinceName);
    found = pool.find((d) => stripPrefix(d.name) === expected);
  }
  return found;
}
function findSubDistrict(storedName, districtId) {
  if (!storedName) return undefined;
  const core = stripPrefix(storedName);
  const pool = districtId ? THAI_SUB_DISTRICTS.filter((s) => s.districtId === districtId) : THAI_SUB_DISTRICTS;
  return pool.find((s) => s.name === storedName || stripPrefix(s.name) === core);
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
  const employees = snap.docs
    .filter((d) => !SKIP_DOC_IDS.has(d.id))
    .map((d) => ({ __id: d.id, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  const results = [];

  employees.forEach((emp) => {
    const provinceRaw = String(emp['จังหวัด'] ?? '').trim();
    const districtRaw = String(emp['เขตอำเภอ'] ?? '').trim();
    const subDistrictRaw = String(emp['แขวงตำบล'] ?? '').trim();
    const zipRaw = String(emp['ไปรษณีย์'] ?? '').trim();
    const countryRaw = String(emp['ประเทศ'] ?? '').trim();

    // ข้ามคนที่ไม่มีข้อมูลที่อยู่เลยสักช่อง
    if (!provinceRaw && !districtRaw && !subDistrictRaw && !zipRaw) return;
    // ข้ามคนที่ระบุประเทศอื่นที่ไม่ใช่ไทย (ไม่ใช้ระบบจังหวัด/อำเภอ/ตำบลแบบไทย)
    if (countryRaw && countryRaw !== 'ไทย') return;

    const province = findProvince(provinceRaw);
    const district = province
      ? findDistrict(districtRaw, province.id, province.name)
      : findDistrict(districtRaw);
    const subDistrict = district ? findSubDistrict(subDistrictRaw, district.id) : findSubDistrict(subDistrictRaw);

    const provinceOk = !provinceRaw || !!province;
    const districtOk = !districtRaw || !!district;
    const subDistrictOk = !subDistrictRaw || !!subDistrict;
    const correctZip = subDistrict ? String(subDistrict.zip).padStart(5, '0') : '';
    const zipOk = !zipRaw || !correctZip || zipRaw === correctZip;

    const problems = [];
    if (!provinceOk) problems.push('จังหวัดไม่พบในฐานข้อมูล');
    if (provinceOk && provinceRaw && !districtOk) problems.push('อำเภอไม่พบ/ไม่ตรงกับจังหวัดนี้');
    if (districtOk && districtRaw && !subDistrictOk) problems.push('ตำบลไม่พบ/ไม่ตรงกับอำเภอนี้');
    if (subDistrictOk && zipRaw && correctZip && !zipOk) problems.push(`รหัสไปรษณีย์ผิด (ที่ถูกคือ ${correctZip})`);
    if (zipRaw && !correctZip && subDistrictRaw && subDistrictOk === false) {
      // ตำบลหาไม่เจอเลยเช็ค zip ไม่ได้ -> ไม่เพิ่มข้อความซ้ำ
    }

    results.push({
      code: String(emp['รหัสพนักงาน'] || emp.__id),
      name: fullName(emp),
      employeeType: String(emp.employee_type || ''),
      provinceRaw,
      districtRaw,
      subDistrictRaw,
      zipRaw,
      provinceMatch: province ? province.name : '',
      districtMatch: district ? district.name : '',
      subDistrictMatch: subDistrict ? subDistrict.name : '',
      correctZip,
      status: problems.length === 0 ? 'ถูกต้อง ✅' : problems.join(' | '),
      hasProblem: problems.length > 0,
    });
  });

  console.log(`คนที่มีข้อมูลที่อยู่ให้ตรวจสอบ: ${results.length} คน`);
  const problemCount = results.filter((r) => r.hasProblem).length;
  console.log(`- ถูกต้องตรงกับฐานข้อมูล: ${results.length - problemCount} คน`);
  console.log(`- พบปัญหา: ${problemCount} คน`);

  // เรียงให้คนที่มีปัญหาอยู่บนสุด
  results.sort((a, b) => Number(b.hasProblem) - Number(a.hasProblem) || a.code.localeCompare(b.code, 'th'));

  const header = [
    'รหัสพนักงาน', 'ชื่อ-สกุล', 'ประเภทพนักงาน',
    'จังหวัด (กรอกไว้)', 'เขต/อำเภอ (กรอกไว้)', 'แขวง/ตำบล (กรอกไว้)', 'ไปรษณีย์ (กรอกไว้)',
    'จังหวัด (ที่ตรงในฐานข้อมูล)', 'อำเภอ (ที่ตรงในฐานข้อมูล)', 'ตำบล (ที่ตรงในฐานข้อมูล)', 'ไปรษณีย์ที่ถูกต้อง',
    'ผลการตรวจสอบ',
  ];
  const aoa = [header, ...results.map((r) => [
    r.code, r.name, r.employeeType,
    r.provinceRaw, r.districtRaw, r.subDistrictRaw, r.zipRaw,
    r.provinceMatch, r.districtMatch, r.subDistrictMatch, r.correctZip,
    r.status,
  ])];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map(() => ({ wch: 20 }));
  const redFill = { fgColor: { rgb: 'FFF8D7DA' } };
  results.forEach((r, i) => {
    if (r.hasProblem) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: header.length - 1 });
      if (!ws[cellRef]) ws[cellRef] = { t: 's', v: r.status };
      ws[cellRef].s = { fill: redFill };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ตรวจสอบที่อยู่');
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'employee_address_validation.xlsx');
  XLSX.writeFile(wb, outPath, { cellStyles: true });
  console.log(`\n✅ สร้างไฟล์: ${outPath}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
