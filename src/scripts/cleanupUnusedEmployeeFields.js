/**
 * ลบ field ที่ไม่จำเป็นออกจากข้อมูลพนักงาน (collection employee_data) + schema ของแต่ละประเภท
 *
 * ทำ 3 ขั้นตอน:
 *   1) สำรองค่าของ field กลุ่ม B (field ที่ยังมีข้อมูลอยู่) ทุกคนไว้เป็นไฟล์ Excel ก่อนลบ
 *      -> exports/employee_fields_backup_before_delete.xlsx
 *   2) ลบ field ออกจาก module_schemas/{emp_indirect, emp_direct_leader, emp_direct_sub}
 *      (ทำให้หายจากตาราง/ฟอร์มในแอป)
 *   3) ลบ key เหล่านี้ออกจากทุก document จริงใน employee_data (deleteField)
 *
 * รัน: node src/scripts/cleanupUnusedEmployeeFields.js
 */

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
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

// ---- กลุ่ม A: ว่าง 100% ไม่มีข้อมูลเลยสักคน (ไม่ต้องสำรองเนื้อหา) ----
const GROUP_A_EMPTY = [
  'ที่อยู่ปัจจุบันต่างจากบัตร',
  'ที่อยู่ปัจจุบัน',
  'วันที่แจ้งออกประกันสังคม',
  'วันที่สิ้นสภาพ',
  'tool_name',
  'category',
  'brand',
  'serial_no',
  'unit_value_thb',
];

// ---- กลุ่ม B: มีข้อมูลอยู่บ้าง แต่ซ้ำซ้อน/ไม่จำเป็น (ต้องสำรองก่อนลบ) ----
const GROUP_B_HAS_DATA = [
  'อายุ',
  'อายุ_ปี',
  'อายุงาน',
  'สถานภาพพนง',
  'ลำดับ',
  'project_id',
  'assigned_site',
  'เลขที่เอกสาร',
  'เลขที่ธุรกรรมแจ้งเข้า',
  'เลขที่ธุรกรรมแจ้งออก',
  'วันที่แจ้งออก',
  'หมายเหตุที่ลาออก',
  'วันที่สมัครปกสคปีเดือนวัน_คศ',
  'วันที่ออกจากงาน',
  'Type',
];

const ALL_FIELDS_TO_DELETE = [...GROUP_A_EMPTY, ...GROUP_B_HAS_DATA];

const SCHEMA_MODULES = ['emp_indirect', 'emp_direct_leader', 'emp_direct_sub'];

function fullName(data) {
  return (
    [data['คำนำหน้าชื่อ'] || data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' ') || String(data['รหัสพนักงาน'] || '')
  );
}

function displayValue(raw) {
  if (Array.isArray(raw)) return raw.join(', ');
  if (raw && typeof raw === 'object') return JSON.stringify(raw);
  return raw === undefined || raw === null ? '' : String(raw);
}

async function backupGroupB(employees) {
  const header = ['รหัสพนักงาน', 'ชื่อ-สกุล', 'employee_type', ...GROUP_B_HAS_DATA];
  const rows = employees
    .filter((emp) => GROUP_B_HAS_DATA.some((f) => displayValue(emp[f]).trim() !== ''))
    .map((emp) => [
      String(emp['รหัสพนักงาน'] || emp.__id),
      fullName(emp),
      String(emp.employee_type || ''),
      ...GROUP_B_HAS_DATA.map((f) => displayValue(emp[f])),
    ]);

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'backup');
  const outPath = path.join(outDir, 'employee_fields_backup_before_delete.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`✅ สำรองข้อมูลแล้ว: ${outPath} (${rows.length} คนที่มีข้อมูลในกลุ่มที่จะลบ)`);
  return outPath;
}

async function cleanupSchemas() {
  const toDeleteSet = new Set(ALL_FIELDS_TO_DELETE);
  for (const moduleId of SCHEMA_MODULES) {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', moduleId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.log(`- ${moduleId}: ไม่พบ schema document, ข้าม`);
      continue;
    }
    const fields = snap.data().fields || [];
    const before = fields.length;
    const newFields = fields.filter((f) => f && f.id && !toDeleteSet.has(f.id));
    const removedCount = before - newFields.length;
    if (removedCount > 0) {
      await setDoc(ref, { fields: newFields }, { merge: true });
    }
    console.log(`- ${moduleId}: ลบ ${removedCount} field จาก schema (เหลือ ${newFields.length} field)`);
  }
}

async function cleanupDocuments(snapDocs) {
  const toDeleteSet = new Set(ALL_FIELDS_TO_DELETE);
  let updatedCount = 0;
  let skippedCount = 0;

  for (const docSnap of snapDocs) {
    if (SKIP_DOC_IDS.has(docSnap.id)) continue;
    const data = docSnap.data();
    const updatePayload = {};
    let hasAny = false;
    toDeleteSet.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        updatePayload[key] = deleteField();
        hasAny = true;
      }
    });
    if (hasAny) {
      await updateDoc(docSnap.ref, updatePayload);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }
  console.log(`✅ ลบ field ออกจากเอกสารพนักงานแล้ว: อัปเดต ${updatedCount} คน, ไม่มี field ที่ต้องลบอยู่แล้ว ${skippedCount} คน`);
}

async function run() {
  console.log('\n=== ขั้นตอน 1: โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const colRef = collection(db, 'CMG-HR-Database', 'root', 'employee_data');
  const snap = await getDocs(colRef);
  const docSnaps = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id));
  const employees = docSnaps.map((d) => ({ __id: d.id, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  console.log('\n=== ขั้นตอน 2: สำรองข้อมูลก่อนลบ ===\n');
  await backupGroupB(employees);

  console.log('\n=== ขั้นตอน 3: ลบ field ออกจาก schema (emp_indirect / emp_direct_leader / emp_direct_sub) ===\n');
  await cleanupSchemas();

  console.log('\n=== ขั้นตอน 4: ลบ field ออกจากเอกสารพนักงานจริงทุกคน ===\n');
  await cleanupDocuments(docSnaps);

  console.log(`\n🎉 เสร็จสิ้น! ลบทั้งหมด ${ALL_FIELDS_TO_DELETE.length} field:`);
  console.log(`   กลุ่ม A (ว่าง 100%, ${GROUP_A_EMPTY.length} field): ${GROUP_A_EMPTY.join(', ')}`);
  console.log(`   กลุ่ม B (มีข้อมูล, สำรองแล้ว, ${GROUP_B_HAS_DATA.length} field): ${GROUP_B_HAS_DATA.join(', ')}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
