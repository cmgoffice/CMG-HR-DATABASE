/**
 * 1) ทำความสะอาดข้อมูลที่ไม่สม่ำเสมอ:
 *    - เพศ: M->ชาย, F->หญิง, ค่าที่ไม่รู้จัก (เช่น "21") -> ลบทิ้ง (เคลียร์ค่า)
 *    - สัญชาติ: แก้คำสะกดผิดของ "เมียนมา", แมป "ไทยใหญ่" -> "อื่นๆ"
 *    - สลับค่าระหว่าง ประเภท_ot <-> สิทธิ์พักร้อน (Staff Monthly เท่านั้น) เพราะข้อมูลสลับ field กันตอน import
 *      ค่า "0" ที่หลงเหลือ (ไม่ตรงกับตัวเลือกใดเลย) จะถูกเคลียร์
 * 2) เปลี่ยน field type เป็น "select" พร้อม options ใน module_schemas ของแต่ละประเภทที่เกี่ยวข้อง
 *
 * รัน: node src/scripts/normalizeAndConvertToDropdowns.js
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

const GENDER_OPTIONS = ['ชาย', 'หญิง', 'LGBT'];
const NATIONALITY_OPTIONS = ['ไทย', 'เมียนมา', 'กัมพูชา', 'ลาว', 'เวียดนาม', 'อื่นๆ'];
const OT_TYPE_OPTIONS = ['OT เหมา', 'OT ตาม', 'ไม่มี OT'];

const GENDER_MAP = { M: 'ชาย', F: 'หญิง', ชาย: 'ชาย', หญิง: 'หญิง' };
const NATIONALITY_MAP = {
  ไทย: 'ไทย',
  เมียนมา: 'เมียนมา',
  เมียนม่า: 'เมียนมา',
  เมยีนมา: 'เมียนมา',
  เมีมนมา: 'เมียนมา',
  กัมพูชา: 'กัมพูชา',
  ไทยใหญ่: 'อื่นๆ',
};

function normalizeValue(map, raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { changed: false, value: raw };
  if (map[v] !== undefined) {
    return { changed: map[v] !== v, value: map[v] };
  }
  return { changed: true, value: '' }; // ไม่รู้จัก -> เคลียร์ค่า
}

async function backupBeforeChange(employees) {
  const header = ['รหัสพนักงาน', 'employee_type', 'เพศ (เดิม)', 'สัญชาติ (เดิม)', 'ประเภท_ot (เดิม)', 'สิทธิ์พักร้อน (เดิม)'];
  const rows = employees.map((e) => [
    String(e['รหัสพนักงาน'] || e.__id),
    String(e.employee_type || ''),
    String(e['เพศ'] ?? ''),
    String(e['สัญชาติ'] ?? ''),
    String(e['ประเภท_ot'] ?? ''),
    String(e['สิทธิ์พักร้อน'] ?? ''),
  ]);
  const outDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'backup');
  const outPath = path.join(outDir, 'employee_gender_nationality_ot_backup.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`✅ สำรองข้อมูลก่อนแก้: ${outPath}`);
}

async function run() {
  console.log('\n=== โหลดข้อมูลพนักงานทั้งหมด ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  const docSnaps = snap.docs.filter((d) => !SKIP_DOC_IDS.has(d.id));
  const employees = docSnaps.map((d) => ({ __id: d.id, ref: d.ref, ...d.data() }));
  console.log(`พนักงานทั้งหมด: ${employees.length} คน`);

  await backupBeforeChange(employees);

  console.log('\n=== ทำความสะอาดข้อมูล + สลับ field OT ===\n');
  let genderFixed = 0;
  let genderCleared = 0;
  let natFixed = 0;
  let otSwapped = 0;

  for (const emp of employees) {
    const payload = {};
    let hasUpdate = false;

    // เพศ
    if (Object.prototype.hasOwnProperty.call(emp, 'เพศ')) {
      const { changed, value } = normalizeValue(GENDER_MAP, emp['เพศ']);
      if (changed) {
        payload['เพศ'] = value;
        hasUpdate = true;
        if (value === '') genderCleared++; else genderFixed++;
      }
    }

    // สัญชาติ
    if (Object.prototype.hasOwnProperty.call(emp, 'สัญชาติ')) {
      const { changed, value } = normalizeValue(NATIONALITY_MAP, emp['สัญชาติ']);
      if (changed) {
        payload['สัญชาติ'] = value;
        hasUpdate = true;
        natFixed++;
      }
    }

    // สลับ ประเภท_ot <-> สิทธิ์พักร้อน (เฉพาะ Staff Monthly ที่มี field นี้)
    const hasOt = Object.prototype.hasOwnProperty.call(emp, 'ประเภท_ot');
    const hasVac = Object.prototype.hasOwnProperty.call(emp, 'สิทธิ์พักร้อน');
    if (hasOt || hasVac) {
      const oldOt = emp['ประเภท_ot'];
      const oldVac = emp['สิทธิ์พักร้อน'];
      // ค่าใหม่ของ ประเภท_ot คือค่าเดิมของ สิทธิ์พักร้อน (ถ้าตรงกับตัวเลือกที่รู้จัก)
      const newOtRaw = String(oldVac ?? '').trim();
      const newOt = OT_TYPE_OPTIONS.includes(newOtRaw) ? newOtRaw : '';
      const newVac = oldOt; // เก็บค่าตามเดิมไว้ก่อน (ไม่ตีความเพิ่ม)
      payload['ประเภท_ot'] = newOt;
      payload['สิทธิ์พักร้อน'] = newVac ?? '';
      hasUpdate = true;
      otSwapped++;
    }

    if (hasUpdate) {
      await updateDoc(emp.ref, payload);
    }
  }

  console.log(`✅ เพศ: แก้ไขให้ตรงมาตรฐาน ${genderFixed} คน, เคลียร์ค่าที่ไม่รู้จัก ${genderCleared} คน`);
  console.log(`✅ สัญชาติ: แก้คำสะกด/แมปค่า ${natFixed} คน`);
  console.log(`✅ สลับ field ประเภท_ot <-> สิทธิ์พักร้อน: ${otSwapped} คน`);

  console.log('\n=== อัปเดต schema ให้เป็น select dropdown ===\n');

  async function updateFieldType(moduleId, fieldId, options) {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', moduleId);
    const snapDoc = await getDoc(ref);
    if (!snapDoc.exists()) {
      console.log(`- ${moduleId}: ไม่พบ schema, ข้าม`);
      return;
    }
    const fields = snapDoc.data().fields || [];
    let found = false;
    const newFields = fields.map((f) => {
      if (f && f.id === fieldId) {
        found = true;
        return { ...f, type: 'select', options };
      }
      return f;
    });
    if (found) {
      await setDoc(ref, { fields: newFields }, { merge: true });
      console.log(`- ${moduleId}.${fieldId}: เปลี่ยนเป็น select [${options.join(', ')}]`);
    } else {
      console.log(`- ${moduleId}.${fieldId}: ไม่พบใน schema นี้ ข้าม`);
    }
  }

  for (const moduleId of ['emp_indirect', 'emp_direct_leader', 'emp_direct_sub']) {
    await updateFieldType(moduleId, 'เพศ', GENDER_OPTIONS);
    await updateFieldType(moduleId, 'สัญชาติ', NATIONALITY_OPTIONS);
  }
  // ประเภท_ot มีเฉพาะ emp_indirect (Staff Monthly)
  await updateFieldType('emp_indirect', 'ประเภท_ot', OT_TYPE_OPTIONS);

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
