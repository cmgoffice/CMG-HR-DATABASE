/**
 * สคริปต์กำหนด "แผนก" ให้พนักงานตามข้อเสนอจัดกลุ่มตำแหน่งที่อนุมัติแล้ว
 * (อ้างอิงจาก canvas: department-grouping-proposal)
 *
 * กติกา:
 *   - จะแก้ "แผนก" เฉพาะพนักงานที่ยังไม่มีแผนก (ว่าง) เท่านั้น
 *     ยกเว้นตำแหน่ง "Procurement manager" ที่ปัจจุบันมีแผนก "Financial & Account"
 *     ผิดอยู่ ให้แก้เป็น "Procurement" แทน (ตามที่ผู้ใช้ยืนยัน)
 *   - แก้คำสะกดผิดในฟิลด์ "ตำแหน่ง":
 *       "ผู้วยช่างซ่อมบำรุง" -> "ผู้ช่วยช่างซ่อมบำรุง"
 *       "Site engineer" (ตัวพิมพ์เล็ก) -> "Site Engineer"
 *   - ตำแหน่งที่ไม่ตรงกับ mapping ใด ๆ จะถูกข้าม และแสดงในรายงานเพื่อตรวจสอบ
 *   - ข้าม document "_schema_metadata"
 *
 * โหมด dry-run (ค่าเริ่มต้น): แสดงรายการที่จะแก้ไข โดยยังไม่เขียนข้อมูลจริง
 *   node src/scripts/assignDepartments.js
 * โหมดเขียนจริง:
 *   node src/scripts/assignDepartments.js --confirm
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

// ตำแหน่ง (ตรงตามที่บันทึกในระบบ) -> แผนกที่เสนอ
const POSITION_TO_DEPT = {
  // Site Labor
  'ช่างไม้/ช่างปูน': 'Site Labor',
  'ผู้ช่วยช่าง': 'Site Labor',
  'Worker': 'Site Labor',
  'Foreman': 'Site Labor',
  'ช่างเชื่อม': 'Site Labor',
  'ผู้ช่วยช่างประกอบ': 'Site Labor',
  'ช่างตัดเสาเข็ม': 'Site Labor',
  'Foreman Rigger': 'Site Labor',
  'ช่างไม้ B': 'Site Labor',

  // Rigger
  'Rigger': 'Rigger',

  // Maintenance
  'ผู้ช่วยช่างซ่อมบำรุง': 'Maintenance',
  'ผู้วยช่างซ่อมบำรุง': 'Maintenance', // สะกดผิด จะถูก normalize เป็น "ผู้ช่วยช่างซ่อมบำรุง"
  'หัวหน้าช่างซ่อมบำรุง': 'Maintenance',
  'ช่างซ่อมบำรุง': 'Maintenance',

  // Construction (วิศวกร/ผู้ควบคุมงาน) -> ใช้แผนกเดิม "Construction"
  'Site Engineer': 'Construction',
  'Site engineer': 'Construction', // จะถูก normalize ตำแหน่งเป็น "Site Engineer" ด้วย
  'Supervisor civil': 'Construction',
  'Construction Manager': 'Construction',
  'Supervisor': 'Construction',
  'Mechanical engineer': 'Construction',
  'QS Engineer': 'Construction',
  'Project Manager': 'Construction',
  'Supervisor steel': 'Construction',
  'Project & workshop manager': 'Construction',
  'Planner leader/CM': 'Construction',
  'Supervisor scaffolding': 'Construction',
  'Planner Engineer': 'Construction',
  'Supervisor rebar': 'Construction',

  // Survey
  'ผู้ช่วย Survey': 'Survey',
  'Supervisor survey': 'Survey',
  'Survey': 'Survey',
  'Survey engineer': 'Survey',

  // Transportation
  'พนักงานขับรถกระบะ': 'Transportation',
  'พนักงานขับรถกะบะ': 'Transportation',
  'พนักงานขับรถแม็คโคร': 'Transportation',
  'พนักงานขับรถสิบล้อดัมพ์': 'Transportation',
  'พนักงานขับรถหกล้อดัมพ์': 'Transportation',
  'พนักงานขับรถหกล้อโดยสาร': 'Transportation',
  'พนักงานขับรถโดยสาร 6 ล้อ': 'Transportation',
  'พนักงานขับรถโดยสารสองแถว': 'Transportation',
  'พนักงานขับรถเครน': 'Transportation',
  'พนักงานขับรถ JCB': 'Transportation',
  'พนักงานขับรถโฟล์คลิฟท์': 'Transportation',
  'พนักงานขับรถเฮี๊ยบแดง': 'Transportation',
  'พนักงานขับเฮี้ยบ': 'Transportation',
  'พนักงานขับรถเฮี้ยบ': 'Transportation',

  // Quality control (แผนกเดิม)
  'QC Inspector': 'Quality control',
  'QC Document': 'Quality control',
  'QC Engineer': 'Quality control',
  'Qc Manager': 'Quality control',
  'Scaffolding Inspector': 'Quality control',

  // Safety (แผนกเดิม)
  'Safety Officer': 'Safety',
  'Safety Technical': 'Safety',
  'Safe technical': 'Safety',
  'Fire Watch': 'Safety',
  'Site Safety Manager': 'Safety',
  'Safety Manager': 'Safety',
  'Work permit': 'Safety',
  'Flagman': 'Safety',

  // Human resource (แผนกเดิม)
  'HRD': 'Human resource',
  'HR manager': 'Human resource',
  'HR Assit': 'Human resource',
  'HR Admin': 'Human resource',

  // Intern
  'นักศึกษาฝึกงาน': 'Intern',

  // Procurement
  'Procurement': 'Procurement',
  'Procurement manager': 'Procurement', // special-case: overrides existing dept

  // IT
  'IT Support': 'IT',
  'Lead IT': 'IT',

  // Administration
  'Admin site': 'Administration',
  'Admin J02': 'Administration',

  // Store (แผนกเดิม)
  'Admin Store': 'Store',
  'Store ass.': 'Store',

  // Electrical (แผนกเดิม)
  'ช่างไฟฟ้า': 'Electrical',

  // General Affairs
  'แม่บ้าน': 'General Affairs',

  // Management
  'GM': 'Management',
  'MD': 'Management',

  // Financial & Account (แผนกเดิม)
  'Accountant': 'Financial & Account',
  'ผู้ช่วยบัญชี': 'Financial & Account',
};

// แก้คำสะกดผิดในฟิลด์ "ตำแหน่ง" (key = ค่าปัจจุบัน, value = ค่าที่แก้ไขแล้ว)
const POSITION_TYPO_FIX = {
  'ผู้วยช่างซ่อมบำรุง': 'ผู้ช่วยช่างซ่อมบำรุง',
  'Site engineer': 'Site Engineer',
};

// ตำแหน่งที่แก้แผนกได้แม้ปัจจุบันมีแผนกอยู่แล้ว (ถือเป็นการแก้ไขข้อมูลผิด ไม่ใช่เติมข้อมูลว่าง)
const OVERRIDE_EXISTING_DEPT_POSITIONS = new Set(['Procurement manager']);

const SKIP_DOC_IDS = new Set(['_schema_metadata']);

function fullName(data) {
  return [data['ชื่อต้น'], data['ชื่อตัว'], data['ชื่อสกุล']]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ') || String(data['รหัสพนักงาน'] || '');
}

async function run() {
  const confirm = process.argv.includes('--confirm');
  console.log(`\n=== กำหนดแผนกตามข้อเสนอจัดกลุ่มตำแหน่ง ===`);
  console.log(`โหมด: ${confirm ? '🚀 เขียนจริง (--confirm)' : '🔍 DRY-RUN (แสดงผลอย่างเดียว)'}\n`);

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  console.log(`โหลดพนักงานทั้งหมด: ${snap.size} คน\n`);

  const toUpdate = [];
  const unmatchedNoDept = [];
  const skippedHasDept = [];

  snap.docs.forEach((docSnap) => {
    if (SKIP_DOC_IDS.has(docSnap.id)) return;
    const data = docSnap.data();
    const position = String(data['ตำแหน่ง'] || '').trim();
    const currentDept = String(data['แผนก'] || '').trim();
    const mappedDept = POSITION_TO_DEPT[position];

    const record = {
      id: docSnap.id,
      code: String(data['รหัสพนักงาน'] || docSnap.id),
      name: fullName(data),
      position,
      currentDept,
      newDept: mappedDept || null,
      newPosition: POSITION_TYPO_FIX[position] || null,
    };

    if (!mappedDept) {
      if (!currentDept) unmatchedNoDept.push(record);
      return;
    }

    if (currentDept) {
      if (OVERRIDE_EXISTING_DEPT_POSITIONS.has(position)) {
        toUpdate.push(record);
      } else {
        skippedHasDept.push(record);
      }
      return;
    }

    toUpdate.push(record);
  });

  const byDept = {};
  toUpdate.forEach((r) => {
    if (!byDept[r.newDept]) byDept[r.newDept] = [];
    byDept[r.newDept].push(r);
  });

  console.log(`=== สรุปจำนวนที่จะกำหนดแผนกให้ ===`);
  console.log(`รวมทั้งหมด: ${toUpdate.length} คน\n`);
  Object.entries(byDept)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([dept, list]) => console.log(`  ${dept}: ${list.length} คน`));

  if (skippedHasDept.length > 0) {
    console.log(`\n=== ข้าม: มีแผนกอยู่แล้ว (ไม่ใช่กรณี override) : ${skippedHasDept.length} คน ===`);
    skippedHasDept.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: "${r.position}" | แผนกปัจจุบัน: ${r.currentDept}`));
  }

  if (unmatchedNoDept.length > 0) {
    console.log(`\n=== ⚠️  ยังไม่มีแผนก และไม่ตรงกับ mapping ใด ๆ: ${unmatchedNoDept.length} คน ===`);
    unmatchedNoDept.forEach((r) => console.log(`  [${r.code}] ${r.name} | ตำแหน่ง: "${r.position}"`));
  }

  // เขียนไฟล์ CSV เพื่อให้ตรวจสอบก่อน/หลังรัน
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const writeCsv = (file, header, rows) => {
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
    fs.writeFileSync(path.join(outDir, file), '\ufeff' + lines.join('\r\n'), 'utf8');
    console.log(`\n📝 บันทึก: exports/${file} (${rows.length} แถว)`);
  };

  writeCsv(
    'department_assignment_plan.csv',
    ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่งเดิม', 'ตำแหน่งใหม่ (ถ้าแก้)', 'แผนกเดิม', 'แผนกใหม่'],
    toUpdate.map((r) => [r.code, r.name, r.position, r.newPosition || '', r.currentDept || '(ว่าง)', r.newDept])
  );
  if (unmatchedNoDept.length > 0) {
    writeCsv(
      'department_assignment_unmatched.csv',
      ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง'],
      unmatchedNoDept.map((r) => [r.code, r.name, r.position])
    );
  }

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
      const payload = { 'แผนก': r.newDept };
      if (r.newPosition) payload['ตำแหน่ง'] = r.newPosition;
      await updateDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', r.id), payload);
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
