/**
 * 1) ล้างค่า "สิทธิ์พักร้อน" ที่ผิด (ค่า "ไทย" ที่หลงเหลือจาก import ผิด) ออก
 *    แล้วเปลี่ยน field type เป็น "number" (จำนวนวันลาพักร้อน) ใน schema ของ Staff Monthly
 * 2) สร้างไฟล์ Excel ให้ HR กรอกข้อมูลที่ยังขาดของพนักงาน "สถานะทำงาน" เท่านั้น
 *    ครอบคลุม: เพศ, สัญชาติ, ที่อยู่ (ประเทศ/จังหวัด/เขตอำเภอ/แขวงตำบล/ไปรษณีย์),
 *              ประเภท_ot, สิทธิ์พักร้อน (เฉพาะ Staff Monthly ที่มี field นี้)
 *    แยกชีทตามประเภทพนักงาน และไฮไลท์ช่องที่ยังว่าง (สีเหลือง)
 *
 * รัน: node src/scripts/fixVacationFieldAndExportMissing.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc,
} = require('firebase/firestore');
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

async function fixVacationField(employees) {
  console.log('\n=== ขั้นตอน 1: ล้างค่า "สิทธิ์พักร้อน" ที่ผิด + เปลี่ยน type เป็นตัวเลข ===\n');
  let cleared = 0;
  for (const emp of employees) {
    if (String(emp['สิทธิ์พักร้อน'] ?? '').trim() === 'ไทย') {
      await updateDoc(emp.ref, { สิทธิ์พักร้อน: '' });
      cleared++;
    }
  }
  console.log(`✅ ล้างค่าผิด "ไทย" ออกจาก สิทธิ์พักร้อน: ${cleared} คน (ค่าเดิมมีสำรองไว้แล้วใน exports/employee_gender_nationality_ot_backup.xlsx)`);

  const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_indirect');
  const snapDoc = await getDoc(ref);
  if (snapDoc.exists()) {
    const fields = snapDoc.data().fields || [];
    const newFields = fields.map((f) => {
      if (!f || f.id !== 'สิทธิ์พักร้อน') return f;
      const { options, ...rest } = f;
      return { ...rest, type: 'number' };
    });
    await setDoc(ref, { fields: newFields }, { merge: true });
    console.log('✅ เปลี่ยน schema: สิทธิ์พักร้อน -> type "number" (จำนวนวัน)');
  }
}

function fullName(data) {
  return (
    [data['คำนำหน้าชื่อ'] || data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || String(data['รหัสพนักงาน'] || '')
  );
}

const MISSING_DATA_COLUMNS = [
  { id: 'เพศ', label: 'เพศ' },
  { id: 'สัญชาติ', label: 'สัญชาติ' },
  { id: 'ประเทศ', label: 'ประเทศ (ที่อยู่)' },
  { id: 'จังหวัด', label: 'จังหวัด' },
  { id: 'เขตอำเภอ', label: 'เขต/อำเภอ' },
  { id: 'แขวงตำบล', label: 'แขวง/ตำบล' },
  { id: 'ไปรษณีย์', label: 'รหัสไปรษณีย์' },
];

const STAFF_ONLY_COLUMNS = [
  { id: 'ประเภท_ot', label: 'ประเภท OT' },
  { id: 'สิทธิ์พักร้อน', label: 'สิทธิ์พักร้อน (จำนวนวัน)' },
];

async function exportMissingData(employees) {
  console.log('\n=== ขั้นตอน 2: สร้างไฟล์ Excel ให้กรอกข้อมูลที่ขาด ===\n');

  const activeEmployees = employees.filter((e) => String(e['สถานะพนักงาน'] || '') === 'ทำงาน');
  console.log(`พนักงานสถานะ "ทำงาน" ทั้งหมด: ${activeEmployees.length} คน (จาก ${employees.length} คน)`);

  const wb = XLSX.utils.book_new();
  const yellowFill = { fgColor: { rgb: 'FFFFF2CC' } };

  for (const g of GROUPS) {
    const groupEmployees = activeEmployees.filter((e) => classify(e) === g.key);
    if (groupEmployees.length === 0) continue;

    const columns = g.key === 'Indirect' ? [...MISSING_DATA_COLUMNS, ...STAFF_ONLY_COLUMNS] : MISSING_DATA_COLUMNS;

    // เรียงให้คนที่ "ขาดข้อมูลเยอะสุด" อยู่บนสุด เพื่อให้ HR กรอกง่าย
    const rowsData = groupEmployees
      .map((emp) => {
        const values = columns.map((c) => String(emp[c.id] ?? '').trim());
        const missingCount = values.filter((v) => !v).length;
        return { emp, values, missingCount };
      })
      .filter((r) => r.missingCount > 0) // เอาเฉพาะคนที่ขาดข้อมูลอย่างน้อย 1 ช่อง
      .sort((a, b) => b.missingCount - a.missingCount || String(a.emp['รหัสพนักงาน']).localeCompare(String(b.emp['รหัสพนักงาน']), 'th'));

    if (rowsData.length === 0) {
      console.log(`- ${g.label}: ข้อมูลครบทุกคนแล้ว ✅ (ไม่ต้องสร้างชีท)`);
      continue;
    }

    const header = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'จำนวนช่องที่ขาด', ...columns.map((c) => c.label)];
    const aoa = [header];
    rowsData.forEach((r) => {
      aoa.push([
        String(r.emp['รหัสพนักงาน'] || r.emp.__id),
        fullName(r.emp),
        String(r.emp['ตำแหน่ง'] || ''),
        r.missingCount,
        ...r.values,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((_, i) => ({ wch: i === 1 ? 26 : i === 2 ? 20 : 16 }));

    // ไฮไลท์ช่องที่ว่าง (เริ่มจากคอลัมน์ index 4 เป็นต้นไป = หลัง "จำนวนช่องที่ขาด")
    rowsData.forEach((r, rowIdx) => {
      r.values.forEach((v, colIdx) => {
        if (!v) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx + 4 });
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
  console.log(`\n✅ สร้างไฟล์: ${outPath}`);
}

async function run() {
  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const docSnaps = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id));
  const employees = docSnaps.map((d) => ({ __id: d.id, ref: d.ref, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  await fixVacationField(employees);
  await exportMissingData(employees);

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
