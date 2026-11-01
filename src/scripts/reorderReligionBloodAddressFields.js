/**
 * ย้าย "ศาสนา", "กรุ๊ปเลือด", "ที่อยู่ปัจจุบันต่างจากบัตร", "ที่อยู่ปัจจุบัน"
 * ไปต่อจากช่อง "วันเกิด" ทันที
 *   - emp_indirect (Staff Monthly): มีทั้ง 4 field นี้ -> ต่อจาก "วันเกิด" (field ธรรมดา)
 *   - emp_direct_leader: มีแค่ ศาสนา/กรุ๊ปเลือด (ไม่มีที่อยู่ปัจจุบัน) -> ต่อจาก "วันเกิดปีเดือนวัน_คศ"
 *
 * รัน: node src/scripts/reorderReligionBloodAddressFields.js
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

function reorder(fields, moveIds, afterId) {
  const moving = moveIds.map((id) => fields.find((f) => f.id === id)).filter(Boolean);
  if (moving.length === 0) return fields;
  const rest = fields.filter((f) => !moveIds.includes(f.id));
  const afterIdx = rest.findIndex((f) => f.id === afterId);
  if (afterIdx === -1) return fields;
  const result = [...rest];
  result.splice(afterIdx + 1, 0, ...moving);
  return result;
}

async function run() {
  // emp_indirect: ศาสนา, กรุ๊ปเลือด, ที่อยู่ปัจจุบันต่างจากบัตร, ที่อยู่ปัจจุบัน -> ต่อจาก "วันเกิด"
  {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_indirect');
    const snap = await getDoc(ref);
    const fields = snap.data().fields || [];
    const newFields = reorder(
      fields,
      ['ศาสนา', 'กรุ๊ปเลือด', 'ที่อยู่ปัจจุบันต่างจากบัตร', 'ที่อยู่ปัจจุบัน'],
      'วันเกิด'
    );
    await setDoc(ref, { fields: newFields }, { merge: true });
    console.log('✅ emp_indirect ลำดับใหม่:', newFields.map((f) => f.id).join(' > '));
  }

  // emp_direct_leader: ศาสนา, กรุ๊ปเลือด -> ต่อจาก "วันเกิดปีเดือนวัน_คศ" (ไม่มีที่อยู่ปัจจุบันใน schema นี้)
  {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', 'emp_direct_leader');
    const snap = await getDoc(ref);
    const fields = snap.data().fields || [];
    const newFields = reorder(fields, ['ศาสนา', 'กรุ๊ปเลือด'], 'วันเกิดปีเดือนวัน_คศ');
    await setDoc(ref, { fields: newFields }, { merge: true });
    console.log('\n✅ emp_direct_leader ลำดับใหม่:', newFields.map((f) => f.id).join(' > '));
  }

  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
