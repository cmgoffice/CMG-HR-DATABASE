/**
 * แก้ definition ของฟิลด์ "สัญชาติ" ใน module_schemas ที่บันทึกไว้แล้ว
 * จาก type: "select" (options: ไทย/ต่างชาติ) -> type: "text" (พิมพ์ชื่อประเทศ/สัญชาติได้อิสระ เช่น "พม่า")
 *
 * รัน: node src/scripts/fixNationalityFieldType.js --confirm
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

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

const SCHEMA_MODULE_IDS = ['emp_indirect', 'emp_direct_leader'];

async function run() {
  const confirm = process.argv.includes('--confirm');
  console.log(`\n=== แก้ type ฟิลด์ "สัญชาติ" เป็น text ===`);
  console.log(`โหมด: ${confirm ? '🚀 เขียนจริง (--confirm)' : '🔍 DRY-RUN (แสดงผลอย่างเดียว)'}\n`);

  for (const moduleId of SCHEMA_MODULE_IDS) {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', moduleId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.log(`[${moduleId}] ไม่พบ schema doc ข้าม`);
      continue;
    }
    const fields = snap.data().fields || [];
    const idx = fields.findIndex((f) => f.id === 'สัญชาติ');
    if (idx === -1) {
      console.log(`[${moduleId}] ไม่พบฟิลด์ "สัญชาติ" ข้าม`);
      continue;
    }
    const current = fields[idx];
    console.log(`[${moduleId}] ฟิลด์ปัจจุบัน:`, JSON.stringify(current));
    const updatedFields = [...fields];
    updatedFields[idx] = { id: 'สัญชาติ', label: 'สัญชาติ', type: 'text' };

    if (confirm) {
      await setDoc(ref, { fields: updatedFields });
      console.log(`[${moduleId}] ✅ อัปเดตแล้ว -> { id: "สัญชาติ", label: "สัญชาติ", type: "text" }\n`);
    } else {
      console.log(`[${moduleId}] จะอัปเดตเป็น -> { id: "สัญชาติ", label: "สัญชาติ", type: "text" }\n`);
    }
  }

  if (!confirm) {
    console.log('ℹ️  DRY-RUN เท่านั้น ยังไม่เขียนข้อมูล ใช้ --confirm เพื่อเขียนจริง\n');
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
