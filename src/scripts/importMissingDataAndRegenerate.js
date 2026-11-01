/**
 * 1) อ่านไฟล์ exports/employee_missing_data_to_fill.xlsx ที่ HR กรอกข้อมูลเพิ่มแล้ว
 *    นำค่าที่กรอกเพิ่ม (ไม่ว่าง) อัปเดตกลับเข้า Firestore
 * 2) สร้างไฟล์ขาดข้อมูลใหม่ (เคลียร์คนที่กรอกครบแล้วออก) ด้วยกติกาใหม่:
 *    - Staff Monthly: ต้องครบทุกช่อง (เพศ/สัญชาติ/ประเทศ/ที่อยู่/ประเภทOT/สิทธิ์พักร้อน) เหมือนเดิม
 *    - Supply manpower, Sub contractor: ไม่บังคับที่อยู่ ต้องมีแค่ เพศ/สัญชาติ/ประเทศ
 *    - DC Daily: ถ้าสัญชาติไม่ใช่ "ไทย" -> ไม่บังคับที่อยู่ (บังคับแค่ เพศ/สัญชาติ/ประเทศ)
 *                ถ้าสัญชาติเป็น "ไทย" หรือยังไม่ทราบ (ว่าง) -> บังคับที่อยู่ครบเหมือนเดิม
 *
 * รัน: node src/scripts/importMissingDataAndRegenerate.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc } = require('firebase/firestore');
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

const GROUPS = [
  { key: 'Indirect', label: 'Staff Monthly', match: (t) => t === 'Indirect' },
  {
    key: 'Direct_TeamLeader',
    label: 'DC Daily',
    match: (t) => ['Direct_TeamLeader', 'Direct: Team Leader', 'Direct - Team Leader'].includes(t),
  },
  {
    key: 'Direct_SupplyDC',
    label: 'Supply manpower',
    match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t),
  },
  {
    key: 'Direct_SubContractor',
    label: 'Sub contractor',
    match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t),
  },
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

// map ชื่อคอลัมน์ในไฟล์ excel -> field id ใน firestore
const LABEL_TO_FIELD = {
  'เพศ': 'เพศ',
  'สัญชาติ': 'สัญชาติ',
  'ประเทศ (ที่อยู่)': 'ประเทศ',
  'จังหวัด': 'จังหวัด',
  'เขต/อำเภอ': 'เขตอำเภอ',
  'แขวง/ตำบล': 'แขวงตำบล',
  'รหัสไปรษณีย์': 'ไปรษณีย์',
  'ประเภท OT': 'ประเภท_ot',
  'สิทธิ์พักร้อน (จำนวนวัน)': 'สิทธิ์พักร้อน',
};

async function importFromExcel(employeesByCode) {
  const srcPath = path.join(process.cwd(), 'exports', 'employee_missing_data_to_fill.xlsx');
  if (!fs.existsSync(srcPath)) {
    console.log('⚠️ ไม่พบไฟล์ employee_missing_data_to_fill.xlsx ข้ามขั้นตอนนำเข้าข้อมูล');
    return 0;
  }
  console.log('\n=== ขั้นตอน 1: นำเข้าข้อมูลที่กรอกเพิ่มจากไฟล์ Excel ===\n');
  const wb = XLSX.readFile(srcPath);
  let updatedCount = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const header = rows[0];
    const dataRows = rows.slice(1);

    for (const row of dataRows) {
      const empId = String(row[0] ?? '').trim();
      if (!empId) continue;
      const emp = employeesByCode.get(empId);
      if (!emp) {
        console.log(`  ⚠️ ไม่พบพนักงานรหัส ${empId} ในฐานข้อมูล (ข้าม)`);
        continue;
      }

      const payload = {};
      header.forEach((label, colIdx) => {
        if (colIdx < 4) return; // ข้าม รหัส/ชื่อ/ตำแหน่ง/จำนวนช่องที่ขาด
        const fieldId = LABEL_TO_FIELD[label];
        if (!fieldId) return;
        const rawVal = row[colIdx];
        const val = String(rawVal ?? '').trim();
        if (!val) return; // ยังว่างอยู่ ไม่ต้องเขียนทับ
        const currentVal = String(emp[fieldId] ?? '').trim();
        if (val !== currentVal) {
          payload[fieldId] = fieldId === 'ไปรษณีย์' || fieldId === 'สิทธิ์พักร้อน' ? val : val;
        }
      });

      if (Object.keys(payload).length > 0) {
        await updateDoc(emp.ref, payload);
        Object.assign(emp, payload); // อัปเดตใน memory ด้วยเพื่อใช้ต่อขั้นตอน 2
        updatedCount++;
        console.log(`  ✅ [${empId}] ${fullName(emp)}:`, payload);
      }
    }
  }

  console.log(`\n✅ นำเข้าข้อมูลสำเร็จ: อัปเดต ${updatedCount} คน`);
  return updatedCount;
}

const BASE_COLUMNS = [
  { id: 'เพศ', label: 'เพศ' },
  { id: 'สัญชาติ', label: 'สัญชาติ' },
  { id: 'ประเทศ', label: 'ประเทศ (ที่อยู่)' },
];
const ADDRESS_COLUMNS = [
  { id: 'จังหวัด', label: 'จังหวัด' },
  { id: 'เขตอำเภอ', label: 'เขต/อำเภอ' },
  { id: 'แขวงตำบล', label: 'แขวง/ตำบล' },
  { id: 'ไปรษณีย์', label: 'รหัสไปรษณีย์' },
];
const STAFF_ONLY_COLUMNS = [
  { id: 'ประเภท_ot', label: 'ประเภท OT' },
  { id: 'สิทธิ์พักร้อน', label: 'สิทธิ์พักร้อน (จำนวนวัน)' },
];

function getColumnsForEmployee(groupKey, emp) {
  if (groupKey === 'Indirect') {
    return [...BASE_COLUMNS, ...ADDRESS_COLUMNS, ...STAFF_ONLY_COLUMNS];
  }
  if (groupKey === 'Direct_SupplyDC' || groupKey === 'Direct_SubContractor') {
    return BASE_COLUMNS; // ไม่บังคับที่อยู่
  }
  if (groupKey === 'Direct_TeamLeader') {
    const nationality = String(emp['สัญชาติ'] ?? '').trim();
    const isKnownNonThai = nationality && nationality !== 'ไทย';
    return isKnownNonThai ? BASE_COLUMNS : [...BASE_COLUMNS, ...ADDRESS_COLUMNS];
  }
  return BASE_COLUMNS;
}

async function exportMissingData(employees) {
  console.log('\n=== ขั้นตอน 2: สร้างไฟล์ Excel ใหม่ (เคลียร์คนที่กรอกครบแล้ว) ===\n');

  const activeEmployees = employees.filter((e) => String(e['สถานะพนักงาน'] || '') === 'ทำงาน');
  console.log(`พนักงานสถานะ "ทำงาน" ทั้งหมด: ${activeEmployees.length} คน (จาก ${employees.length} คน)`);

  const wb = XLSX.utils.book_new();
  const yellowFill = { fgColor: { rgb: 'FFFFF2CC' } };

  for (const g of GROUPS) {
    const groupEmployees = activeEmployees.filter((e) => classify(e) === g.key);
    if (groupEmployees.length === 0) continue;

    const rowsData = groupEmployees
      .map((emp) => {
        const columns = getColumnsForEmployee(g.key, emp);
        const values = columns.map((c) => String(emp[c.id] ?? '').trim());
        const missingCount = values.filter((v) => !v).length;
        return { emp, columns, values, missingCount };
      })
      .filter((r) => r.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount || String(a.emp['รหัสพนักงาน']).localeCompare(String(b.emp['รหัสพนักงาน']), 'th'));

    if (rowsData.length === 0) {
      console.log(`- ${g.label}: ข้อมูลครบทุกคนแล้ว ✅ (ไม่ต้องสร้างชีท)`);
      continue;
    }

    // ใช้ชุดคอลัมน์ที่กว้างที่สุดเท่าที่กลุ่มนี้ใช้ เป็น header (เผื่อ DC Daily มีทั้งแบบมี/ไม่มีที่อยู่ปนกัน)
    const headerColumns = rowsData.some((r) => r.columns.length > BASE_COLUMNS.length)
      ? (g.key === 'Indirect' ? [...BASE_COLUMNS, ...ADDRESS_COLUMNS, ...STAFF_ONLY_COLUMNS] : [...BASE_COLUMNS, ...ADDRESS_COLUMNS])
      : BASE_COLUMNS;

    const header = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'จำนวนช่องที่ขาด', ...headerColumns.map((c) => c.label)];
    const aoa = [header];
    const notApplicableCells = []; // เซลล์ที่ไม่บังคับกรอก (เช่นที่อยู่ของคนต่างชาติ) ให้ทำสีเทาแทน
    rowsData.forEach((r, rowIdx) => {
      const rowValues = headerColumns.map((c) => {
        const applicable = r.columns.some((rc) => rc.id === c.id);
        if (!applicable) {
          notApplicableCells.push({ row: rowIdx, col: headerColumns.indexOf(c) });
          return '-';
        }
        return String(r.emp[c.id] ?? '').trim();
      });
      aoa.push([
        String(r.emp['รหัสพนักงาน'] || r.emp.__id),
        fullName(r.emp),
        String(r.emp['ตำแหน่ง'] || ''),
        r.missingCount,
        ...rowValues,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((_, i) => ({ wch: i === 1 ? 26 : i === 2 ? 20 : 16 }));

    rowsData.forEach((r, rowIdx) => {
      headerColumns.forEach((c, colIdx) => {
        const applicable = r.columns.some((rc) => rc.id === c.id);
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx + 4 });
        if (!applicable) {
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '-' };
          ws[cellRef].s = { fill: { fgColor: { rgb: 'FFD9D9D9' } }, font: { italic: true, color: { rgb: 'FF888888' } } };
          return;
        }
        const val = String(r.emp[c.id] ?? '').trim();
        if (!val) {
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          ws[cellRef].s = { fill: yellowFill };
        }
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, g.label.slice(0, 31));
    console.log(`- ${g.label}: ${rowsData.length} คนที่ยังขาดข้อมูลบางช่อง (จากทั้งหมด ${groupEmployees.length} คน)`);
  }

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'employee_missing_data_to_fill.xlsx');
  XLSX.writeFile(wb, outPath, { cellStyles: true });
  console.log(`\n✅ สร้างไฟล์ใหม่: ${outPath}`);
}

async function run() {
  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const docSnaps = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id));
  const employees = docSnaps.map((d) => ({ __id: d.id, ref: d.ref, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  const employeesByCode = new Map();
  employees.forEach((e) => {
    employeesByCode.set(String(e['รหัสพนักงาน'] || e.__id), e);
  });

  await importFromExcel(employeesByCode);
  await exportMissingData(employees);

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
