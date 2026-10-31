/**
 * สำรวจ (read-only) ฟิลด์ทั้งหมดที่ใช้จริงในข้อมูลพนักงาน (collection employee_data)
 * แยกตาม "ประเภทพนักงาน" (employee_type) ทั้ง 4 กลุ่มที่ระบบใช้งานอยู่:
 *   - Indirect              (เมนู Staff Monthly)
 *   - Direct_TeamLeader     (เมนู DC Daily)
 *   - Direct_SupplyDC       (เมนู Supply manpower)
 *   - Direct_SubContractor  (เมนู Sub contractor)
 *
 * สำหรับแต่ละกลุ่ม จะสรุป:
 *   - field ที่พบในข้อมูลจริง (ไม่ใช่แค่ใน schema)
 *   - จำนวน/สัดส่วนคนที่มีค่าในฟิลด์นั้น (fill rate)
 *   - ตัวอย่างค่าจริง 3 ตัวอย่าง
 *
 * และสรุปภาพรวม: field ไหนมีครบทุกประเภท, field ไหนมีเฉพาะบางประเภท (ความไม่สอดคล้องของ schema)
 *
 * Output: exports/employee_field_survey.xlsx
 *   - ชีท "สรุปรวมทุกประเภท"
 *   - ชีทแยกราย ประเภท (Staff Monthly / DC Daily / Supply manpower / Sub contractor)
 *
 * รัน: node src/scripts/surveyEmployeeFields.js
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

// ตรงกับ MODULE_CONFIG ใน src/App.tsx
const GROUPS = [
  { key: 'Indirect', label: 'Staff Monthly (emp_indirect)', match: (t) => t === 'Indirect' },
  {
    key: 'Direct_TeamLeader',
    label: 'DC Daily (emp_direct_leader)',
    match: (t) => ['Direct_TeamLeader', 'Direct: Team Leader', 'Direct - Team Leader'].includes(t),
  },
  {
    key: 'Direct_SupplyDC',
    label: 'Supply manpower (emp_direct_supply)',
    match: (t) => ['Direct_SupplyDC', 'Direct: Supply DC', 'Direct - Supply DC'].includes(t),
  },
  {
    key: 'Direct_SubContractor',
    label: 'Sub contractor (emp_direct_sub)',
    match: (t) => ['Direct_SubContractor', 'Direct: Sub Contractor', 'Direct - Sub Contractor'].includes(t),
  },
];

function classify(emp) {
  const t = String(emp.employee_type || '').trim();
  for (const g of GROUPS) {
    if (g.match(t)) return g.key;
  }
  return 'ไม่ระบุ/อื่นๆ';
}

function summarizeFields(docs) {
  /** @type {Record<string, {filled: number, empty: number, samples: string[]}>} */
  const stats = {};
  docs.forEach((data) => {
    Object.keys(data).forEach((key) => {
      if (!stats[key]) stats[key] = { filled: 0, empty: 0, samples: [] };
    });
  });

  docs.forEach((data) => {
    Object.keys(stats).forEach((key) => {
      const raw = data[key];
      let display;
      if (Array.isArray(raw)) {
        display = raw.join(', ');
      } else if (raw && typeof raw === 'object') {
        display = JSON.stringify(raw);
      } else {
        display = raw === undefined || raw === null ? '' : String(raw);
      }
      const value = display.trim();
      if (!value) {
        stats[key].empty++;
        return;
      }
      stats[key].filled++;
      if (stats[key].samples.length < 3 && !stats[key].samples.includes(value)) {
        stats[key].samples.push(value);
      }
    });
  });

  return stats;
}

function buildSheetRows(stats, total) {
  const rows = Object.keys(stats)
    .sort((a, b) => stats[b].filled - stats[a].filled)
    .map((key) => ({
      field: key,
      filled: stats[key].filled,
      empty: stats[key].empty,
      fillRate: total > 0 ? `${((stats[key].filled / total) * 100).toFixed(1)}%` : '0%',
      sample1: stats[key].samples[0] || '',
      sample2: stats[key].samples[1] || '',
      sample3: stats[key].samples[2] || '',
    }));
  return rows;
}

function sheetFromRows(header, rows, colWidths) {
  const aoa = [header, ...rows.map((r) => Object.values(r))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws['!cols'] = colWidths.map((wch) => ({ wch }));
  return ws;
}

async function run() {
  console.log('\n=== กำลังโหลดข้อมูลพนักงานทั้งหมดจาก Firestore ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const allDocs = snap.docs
    .filter((d) => !SKIP_DOC_IDS.has(d.id))
    .map((d) => ({ __id: d.id, ...d.data() }));

  console.log(`พนักงานทั้งหมด: ${allDocs.length} เอกสาร\n`);

  const grouped = {};
  GROUPS.forEach((g) => (grouped[g.key] = []));
  grouped['ไม่ระบุ/อื่นๆ'] = [];

  allDocs.forEach((emp) => {
    const key = classify(emp);
    grouped[key].push(emp);
  });

  Object.keys(grouped).forEach((key) => {
    console.log(`- ${key}: ${grouped[key].length} คน`);
  });

  const wb = XLSX.utils.book_new();
  const colWidths = [30, 10, 10, 10, 32, 32, 32];
  const header = ['ชื่อ Field', 'มีค่า (คน)', 'ว่าง (คน)', 'สัดส่วนมีค่า', 'ตัวอย่าง 1', 'ตัวอย่าง 2', 'ตัวอย่าง 3'];

  // ---- ชีทแยกรายประเภท ----
  const perGroupStats = {};
  GROUPS.forEach((g) => {
    const docs = grouped[g.key];
    const stats = summarizeFields(docs);
    perGroupStats[g.key] = { stats, total: docs.length, label: g.label };
    const rows = buildSheetRows(stats, docs.length);
    const sheetName = g.label.split(' (')[0].slice(0, 31);
    const ws = sheetFromRows(header, rows, colWidths);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ชีท "ไม่ระบุ/อื่นๆ" ถ้ามี
  if (grouped['ไม่ระบุ/อื่นๆ'].length > 0) {
    const docs = grouped['ไม่ระบุ/อื่นๆ'];
    const stats = summarizeFields(docs);
    const rows = buildSheetRows(stats, docs.length);
    const ws = sheetFromRows(header, rows, colWidths);
    XLSX.utils.book_append_sheet(wb, ws, 'ไม่ระบุ-อื่นๆ'.slice(0, 31));
  }

  // ---- ชีทสรุปรวม: field x ประเภท (matrix) + รวมทุกคน ----
  const allFieldNames = new Set();
  GROUPS.forEach((g) => Object.keys(perGroupStats[g.key].stats).forEach((f) => allFieldNames.add(f)));

  const overallStats = summarizeFields(allDocs);
  Object.keys(overallStats).forEach((f) => allFieldNames.add(f));

  const sortedFields = Array.from(allFieldNames).sort((a, b) => {
    const totalA = GROUPS.reduce((sum, g) => sum + (perGroupStats[g.key].stats[a]?.filled || 0), 0);
    const totalB = GROUPS.reduce((sum, g) => sum + (perGroupStats[g.key].stats[b]?.filled || 0), 0);
    return totalB - totalA;
  });

  const matrixHeader = [
    'ชื่อ Field',
    ...GROUPS.map((g) => `${g.label} (มีค่า/${perGroupStats[g.key].total})`),
    'รวมทุกคน (มีค่า/' + allDocs.length + ')',
    'มีครบทุกประเภทหรือไม่',
    'ตัวอย่างค่าจริง (รวม)',
  ];

  const matrixRows = sortedFields.map((field) => {
    const perGroupCells = GROUPS.map((g) => {
      const s = perGroupStats[g.key].stats[field];
      return s ? s.filled : 0;
    });
    const presentInGroups = GROUPS.filter((g) => (perGroupStats[g.key].stats[field]?.filled || 0) > 0).length;
    const consistency =
      presentInGroups === 0
        ? '-'
        : presentInGroups === GROUPS.length
        ? 'มีครบทุกประเภท'
        : `มีเฉพาะ ${presentInGroups}/${GROUPS.length} ประเภท`;
    const overallFilled = overallStats[field]?.filled || 0;
    const samples = (overallStats[field]?.samples || []).join(' | ');
    return [field, ...perGroupCells, overallFilled, consistency, samples];
  });

  const summaryWs = sheetFromRows(
    matrixHeader,
    matrixRows.map((r) => ({
      field: r[0],
      g1: r[1],
      g2: r[2],
      g3: r[3],
      g4: r[4],
      total: r[5],
      consistency: r[6],
      samples: r[7],
    })),
    [30, 18, 18, 18, 18, 16, 20, 50]
  );
  // ใส่ sheet สรุปไว้ลำดับแรก
  XLSX.utils.book_append_sheet(wb, summaryWs, 'สรุปรวมทุกประเภท');
  // ย้ายไปอยู่ตำแหน่งแรกของ workbook
  wb.SheetNames.unshift(wb.SheetNames.pop());

  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'employee_field_survey.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ สร้างไฟล์สำเร็จ: ${outPath}`);
  console.log(`   รวม field ทั้งหมดที่พบในข้อมูลจริง: ${sortedFields.length} fields`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
