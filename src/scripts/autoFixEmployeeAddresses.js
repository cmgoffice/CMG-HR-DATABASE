/**
 * แก้ไขที่อยู่พนักงาน (จังหวัด/เขตอำเภอ/แขวงตำบล/ไปรษณีย์) ที่พิมพ์ผิด ให้ตรงกับฐานข้อมูล
 * เขตการปกครองไทยจริงโดยอัตโนมัติ
 *
 * วิธีจับคู่:
 *   1) ตรงเป๊ะ หรือ ตรงหลังตัดคำนำหน้า (จ./อ./ต./เขต/แขวง/ตำบล/อำเภอ/จังหวัด)
 *   2) เคสพิเศษ "อ.เมือง" แบบย่อ -> จับคู่กับ "เมือง" + ชื่อจังหวัด
 *   3) ถ้ายังไม่ตรง ใช้ Levenshtein distance หาคำที่สะกดใกล้เคียงที่สุดในขอบเขตที่ถูกต้อง
 *      (จังหวัด: ค้นทั้งประเทศ / อำเภอ: ค้นเฉพาะในจังหวัดที่ match แล้ว / ตำบล: ค้นเฉพาะในอำเภอที่ match แล้ว)
 *      ใช้เฉพาะเมื่อ distance <= 2 ตัวอักษร และเป็นคำที่ใกล้เคียงที่สุดแบบไม่กำกวม (ไม่มีคำอื่น distance เท่ากัน)
 *
 * ค่าที่ match ไม่ได้ (กำกวม/ต่างกันเกินไป) จะไม่ถูกแก้ และจะถูกรายงานแยกให้ตรวจสอบเองต่อ
 *
 * ทุกคนที่ถูกแก้ไข จะถูกสำรองค่าก่อนแก้ไว้ใน exports/employee_address_autofix_backup.xlsx ก่อนเขียนทับ
 *
 * รัน: node src/scripts/autoFixEmployeeAddresses.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc } = require('firebase/firestore');
const XLSX = require('xlsx');

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

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// หา candidate ที่ใกล้เคียงที่สุดแบบไม่กำกวม (ไม่มีคู่แข่ง distance เท่ากัน) และ distance <= maxDist
function fuzzyBest(core, candidates, getName, maxDist = 2) {
  let best = null;
  let bestDist = Infinity;
  let tie = false;
  candidates.forEach((c) => {
    const d = levenshtein(core, stripPrefix(getName(c)));
    if (d < bestDist) {
      bestDist = d;
      best = c;
      tie = false;
    } else if (d === bestDist) {
      tie = true;
    }
  });
  if (best && !tie && bestDist <= maxDist) return best;
  return null;
}

function matchProvince(storedName) {
  if (!storedName) return { match: undefined, method: '' };
  const core = stripPrefix(storedName);
  let found = THAI_PROVINCES.find((p) => p.name === storedName || stripPrefix(p.name) === core);
  if (found) return { match: found, method: 'exact' };
  found = fuzzyBest(core, THAI_PROVINCES, (p) => p.name);
  return { match: found, method: found ? 'fuzzy' : '' };
}

function matchDistrict(storedName, provinceId, provinceName) {
  if (!storedName || !provinceId) return { match: undefined, method: '' };
  const core = stripPrefix(storedName);
  const pool = THAI_DISTRICTS.filter((d) => d.provinceId === provinceId);
  let found = pool.find((d) => d.name === storedName || stripPrefix(d.name) === core);
  if (found) return { match: found, method: 'exact' };
  if (core === 'เมือง' && provinceName) {
    const expected = 'เมือง' + stripPrefix(provinceName);
    found = pool.find((d) => stripPrefix(d.name) === expected);
    if (found) return { match: found, method: 'เมือง-shorthand' };
  }
  found = fuzzyBest(core, pool, (d) => d.name);
  return { match: found, method: found ? 'fuzzy' : '' };
}

function matchSubDistrict(storedName, districtId) {
  if (!storedName || !districtId) return { match: undefined, method: '' };
  const core = stripPrefix(storedName);
  const pool = THAI_SUB_DISTRICTS.filter((s) => s.districtId === districtId);
  let found = pool.find((s) => s.name === storedName || stripPrefix(s.name) === core);
  if (found) return { match: found, method: 'exact' };
  found = fuzzyBest(core, pool, (s) => s.name);
  return { match: found, method: found ? 'fuzzy' : '' };
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
    .map((d) => ({ __id: d.id, ref: d.ref, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  const backupRows = [];
  const unresolvedRows = [];
  let fixedCount = 0;
  let alreadyOkCount = 0;

  for (const emp of employees) {
    const provinceRaw = String(emp['จังหวัด'] ?? '').trim();
    const districtRaw = String(emp['เขตอำเภอ'] ?? '').trim();
    const subDistrictRaw = String(emp['แขวงตำบล'] ?? '').trim();
    const zipRaw = String(emp['ไปรษณีย์'] ?? '').trim();
    const countryRaw = String(emp['ประเทศ'] ?? '').trim();

    if (!provinceRaw && !districtRaw && !subDistrictRaw && !zipRaw) continue;
    if (countryRaw && countryRaw !== 'ไทย') continue;

    const { match: province, method: provinceMethod } = matchProvince(provinceRaw);
    const { match: district, method: districtMethod } = province
      ? matchDistrict(districtRaw, province.id, province.name)
      : { match: undefined, method: '' };
    const { match: subDistrict, method: subDistrictMethod } = district
      ? matchSubDistrict(subDistrictRaw, district.id)
      : { match: undefined, method: '' };

    const correctZip = subDistrict ? String(subDistrict.zip).padStart(5, '0') : '';

    const newProvince = province ? province.name : provinceRaw;
    const newDistrict = district ? district.name : districtRaw;
    const newSubDistrict = subDistrict ? subDistrict.name : subDistrictRaw;
    const newZip = correctZip || zipRaw;

    const changed =
      (provinceRaw && newProvince !== provinceRaw) ||
      (districtRaw && newDistrict !== districtRaw) ||
      (subDistrictRaw && newSubDistrict !== subDistrictRaw) ||
      (zipRaw && newZip !== zipRaw);

    const stillUnresolved =
      (provinceRaw && !province) || (districtRaw && !district) || (subDistrictRaw && !subDistrict);

    if (!changed && !stillUnresolved) {
      alreadyOkCount++;
      continue;
    }

    backupRows.push([
      String(emp['รหัสพนักงาน'] || emp.__id),
      fullName(emp),
      provinceRaw, districtRaw, subDistrictRaw, zipRaw,
    ]);

    if (changed) {
      const payload = {};
      if (provinceRaw) payload['จังหวัด'] = newProvince;
      if (districtRaw) payload['เขตอำเภอ'] = newDistrict;
      if (subDistrictRaw) payload['แขวงตำบล'] = newSubDistrict;
      if (zipRaw || correctZip) payload['ไปรษณีย์'] = newZip;
      await updateDoc(emp.ref, payload);
      fixedCount++;
      console.log(
        `✅ แก้ไข [${emp['รหัสพนักงาน'] || emp.__id}] ${fullName(emp)}: ` +
          `"${provinceRaw}/${districtRaw}/${subDistrictRaw}/${zipRaw}" -> "${newProvince}/${newDistrict}/${newSubDistrict}/${newZip}" ` +
          `(จังหวัด:${provinceMethod || '-'}, อำเภอ:${districtMethod || '-'}, ตำบล:${subDistrictMethod || '-'})`
      );
    }

    if (stillUnresolved) {
      unresolvedRows.push([
        String(emp['รหัสพนักงาน'] || emp.__id),
        fullName(emp),
        String(emp.employee_type || ''),
        provinceRaw, districtRaw, subDistrictRaw, zipRaw,
        province ? province.name : '(ไม่พบ)',
        district ? district.name : '(ไม่พบ)',
        subDistrict ? subDistrict.name : '(ไม่พบ)',
      ]);
    }
  }

  console.log(`\n✅ ตรงกับฐานข้อมูลอยู่แล้ว: ${alreadyOkCount} คน`);
  console.log(`✅ แก้ไขอัตโนมัติสำเร็จ: ${fixedCount} คน`);
  console.log(`⚠️ ยังจับคู่ไม่ได้ ต้องตรวจสอบเอง: ${unresolvedRows.length} คน`);

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (backupRows.length > 0) {
    const wsBackup = XLSX.utils.aoa_to_sheet([
      ['รหัสพนักงาน', 'ชื่อ-สกุล', 'จังหวัด (ก่อนแก้)', 'เขต/อำเภอ (ก่อนแก้)', 'แขวง/ตำบล (ก่อนแก้)', 'ไปรษณีย์ (ก่อนแก้)'],
      ...backupRows,
    ]);
    const wbBackup = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbBackup, wsBackup, 'backup');
    XLSX.writeFile(wbBackup, path.join(outDir, 'employee_address_autofix_backup.xlsx'));
    console.log(`\n✅ สำรองค่าก่อนแก้ไว้ที่: exports/employee_address_autofix_backup.xlsx`);
  }

  if (unresolvedRows.length > 0) {
    const wsUnresolved = XLSX.utils.aoa_to_sheet([
      [
        'รหัสพนักงาน', 'ชื่อ-สกุล', 'ประเภทพนักงาน',
        'จังหวัด (กรอกไว้)', 'เขต/อำเภอ (กรอกไว้)', 'แขวง/ตำบล (กรอกไว้)', 'ไปรษณีย์ (กรอกไว้)',
        'จังหวัดที่ match ได้', 'อำเภอที่ match ได้', 'ตำบลที่ match ได้',
      ],
      ...unresolvedRows,
    ]);
    wsUnresolved['!cols'] = Array(10).fill({ wch: 20 });
    const wbUnresolved = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbUnresolved, wsUnresolved, 'ต้องตรวจสอบเอง');
    XLSX.writeFile(wbUnresolved, path.join(outDir, 'employee_address_needs_manual_review.xlsx'));
    console.log(`✅ รายชื่อที่ต้องตรวจสอบเอง: exports/employee_address_needs_manual_review.xlsx`);
  }

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
