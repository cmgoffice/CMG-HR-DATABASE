/**
 * ตรวจสอบข้อมูลที่ขาด "ทุกช่องในฟอร์ม" (ไม่ใช่แค่กลุ่มที่เคยเลือกไว้ก่อนหน้า) ของพนักงานสถานะ "ทำงาน"
 * ดึงรายชื่อฟิลด์ตรงจาก module_schemas ปัจจุบัน (emp_indirect / emp_direct_leader) ตามที่แอปใช้แสดงผลจริง
 *
 * กติกาพิเศษ (ตามที่ยืนยันไว้ก่อนหน้า):
 *   - Supply manpower / Sub contractor: ไม่บังคับกลุ่มที่อยู่ (จังหวัด/เขตอำเภอ/แขวงตำบล/ไปรษณีย์/ที่อยู่บรรทัด_1-3)
 *   - DC Daily: ถ้าสัญชาติไม่ใช่ "ไทย" (ทราบแน่ชัดแล้ว) ไม่บังคับกลุ่มที่อยู่เช่นกัน
 *   - Staff Monthly: บังคับทุกช่อง
 *   - ทุกกลุ่ม: ไม่ตรวจช่องที่เกี่ยวกับ "การลาออก" (resignation_*, วันที่ลาออก, สาเหตุที่ลาออกงาน) เพราะใช้เฉพาะคนที่ลาออกแล้ว
 *
 * รัน: node src/scripts/exportFullMissingDataAllFields.js
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

const EXCLUDE_FIELD_IDS = new Set([
  'รหัสพนักงาน', 'id', 'employee_type',
  'resignation_date', 'resignation_reason_category', 'resignation_reason_detail',
  'วันที่ลาออก', 'สาเหตุที่ลาออกงาน',
  'ที่อยู่ปัจจุบันต่างจากบัตร', // checkbox ไม่ติ๊ก = ค่าปกติ ไม่ใช่ข้อมูลขาด
  'ที่อยู่ปัจจุบัน', // ต้องกรอกเฉพาะเมื่อติ๊กช่องด้านบนว่า "ต่างจากบัตร" เท่านั้น ไม่บังคับโดยทั่วไป
]);
const ADDRESS_FIELD_IDS = new Set([
  'ที่อยู่บรรทัด_1', 'ที่อยู่บรรทัด_2', 'ที่อยู่บรรทัด_3',
  'จังหวัด', 'เขตอำเภอ', 'แขวงตำบล', 'ไปรษณีย์',
]);

const GROUPS = [
  { key: 'Indirect', label: 'Staff Monthly', schemaId: 'emp_indirect', match: (t) => t === 'Indirect' },
  { key: 'Direct_TeamLeader', label: 'DC Daily', schemaId: 'emp_direct_leader', match: (t) => ['Direct_TeamLeader', 'Direct: Team Leader', 'Direct - Team Leader'].includes(t) },
  { key: 'Direct_SupplyDC', label: 'Supply manpower', schemaId: 'emp_direct_leader', match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t) },
  { key: 'Direct_SubContractor', label: 'Sub contractor', schemaId: 'emp_direct_leader', match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t) },
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

// Supply manpower / Sub contractor: ตัดให้เหลือแค่ 4 ช่องนี้ตามที่ยืนยันไว้ล่าสุด (ช่องอื่นไม่บังคับ/ไม่ตรวจแล้ว)
const SUPPLY_SUB_ONLY_FIELD_IDS = ['เพศ', 'สัญชาติ', 'ประเทศ', 'วันเกิดปีเดือนวัน_คศ'];

function getColumnsForEmployee(groupKey, emp, allFields) {
  const base = allFields.filter((f) => !EXCLUDE_FIELD_IDS.has(f.id));
  if (groupKey === 'Indirect') return base; // staff monthly: บังคับทุกช่อง
  if (groupKey === 'Direct_SupplyDC' || groupKey === 'Direct_SubContractor') {
    return base.filter((f) => SUPPLY_SUB_ONLY_FIELD_IDS.includes(f.id));
  }
  if (groupKey === 'Direct_TeamLeader') {
    const nationality = String(emp['สัญชาติ'] ?? '').trim();
    const isKnownNonThai = nationality && nationality !== 'ไทย';
    return isKnownNonThai ? base.filter((f) => !ADDRESS_FIELD_IDS.has(f.id)) : base;
  }
  return base;
}

async function run() {
  console.log('\n=== โหลด schema ปัจจุบัน ===\n');
  const schemaCache = {};
  for (const schemaId of ['emp_indirect', 'emp_direct_leader']) {
    const snap = await getDoc(doc(db, 'CMG-HR-Database', 'root', 'module_schemas', schemaId));
    schemaCache[schemaId] = (snap.data().fields || []).map((f) => ({ id: f.id, label: f.label }));
    console.log(`- ${schemaId}: ${schemaCache[schemaId].length} fields`);
  }

  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const employees = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id)).map((d) => d.data());
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  const activeEmployees = employees.filter((e) => String(e['สถานะพนักงาน'] || '') === 'ทำงาน');
  console.log(`พนักงานสถานะ "ทำงาน": ${activeEmployees.length} คน`);

  const wb = XLSX.utils.book_new();
  const yellowFill = { fgColor: { rgb: 'FFFFF2CC' } };
  const grayFill = { fgColor: { rgb: 'FFD9D9D9' } };

  for (const g of GROUPS) {
    const groupEmployees = activeEmployees.filter((e) => classify(e) === g.key);
    if (groupEmployees.length === 0) continue;
    const allFields = schemaCache[g.schemaId];
    const allFieldsNoAddr = allFields.filter((f) => !EXCLUDE_FIELD_IDS.has(f.id));
    // header: ใช้ชุด field กว้างสุดของกลุ่มนี้ (รวมที่อยู่ไว้เสมอ เผื่อ DC Daily มีทั้งคนไทย/ต่างชาติปนกัน)
    // ยกเว้น Supply manpower / Sub contractor ที่ตัดขอบเขตให้เหลือแค่ 4 ช่องหลักแล้ว
    const headerFields =
      g.key === 'Direct_SupplyDC' || g.key === 'Direct_SubContractor'
        ? allFieldsNoAddr.filter((f) => SUPPLY_SUB_ONLY_FIELD_IDS.includes(f.id))
        : allFieldsNoAddr;

    const rowsData = groupEmployees
      .map((emp) => {
        const applicable = getColumnsForEmployee(g.key, emp, allFields);
        const applicableIds = new Set(applicable.map((f) => f.id));
        const values = headerFields.map((f) => String(emp[f.id] ?? '').trim());
        const missingCount = headerFields.filter((f, i) => applicableIds.has(f.id) && !values[i]).length;
        return { emp, applicableIds, values, missingCount };
      })
      .filter((r) => r.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount || String(a.emp['รหัสพนักงาน']).localeCompare(String(b.emp['รหัสพนักงาน']), 'th'));

    if (rowsData.length === 0) {
      console.log(`- ${g.label}: ข้อมูลครบทุกคนแล้ว ✅ (ไม่ต้องสร้างชีท)`);
      continue;
    }

    const header = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'จำนวนช่องที่ขาด', ...headerFields.map((f) => f.label)];
    const aoa = [header];
    rowsData.forEach((r) => {
      aoa.push([
        String(r.emp['รหัสพนักงาน'] || ''),
        fullName(r.emp),
        String(r.emp['ตำแหน่ง'] || ''),
        r.missingCount,
        ...r.values,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((_, i) => ({ wch: i === 1 ? 26 : i === 2 ? 20 : 15 }));

    rowsData.forEach((r, rowIdx) => {
      headerFields.forEach((f, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx + 4 });
        const applicable = r.applicableIds.has(f.id);
        const val = r.values[colIdx];
        if (!applicable) {
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '-' };
          ws[cellRef].s = { fill: grayFill, font: { italic: true, color: { rgb: 'FF888888' } } };
        } else if (!val) {
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          ws[cellRef].s = { fill: yellowFill };
        }
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, g.label.slice(0, 31));
    console.log(`- ${g.label}: ${rowsData.length} คนที่ยังขาดข้อมูลบางช่อง (จากทั้งหมด ${groupEmployees.length} คน, ตรวจ ${headerFields.length} ช่อง)`);
  }

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'employee_missing_data_full_all_fields.xlsx');
  XLSX.writeFile(wb, outPath, { cellStyles: true });
  console.log(`\n✅ สร้างไฟล์: ${outPath}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
