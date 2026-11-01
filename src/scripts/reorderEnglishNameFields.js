/**
 * ย้าย field "ชื่ออังกฤษ" และ "นามสกุลอังกฤษ" ให้มาอยู่ต่อจากชื่อ-นามสกุลภาษาไทยทันที
 * (เดิมอยู่ท้ายฟอร์ม) ทำทั้ง 2 schema: emp_indirect (Staff Monthly) และ emp_direct_leader
 * (DC Daily / Supply manpower / Sub contractor ใช้ schema นี้ร่วมกัน)
 *
 * รัน: node src/scripts/reorderEnglishNameFields.js
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

function moveAfterLastName(fields) {
  const engFirst = fields.find((f) => f.id === 'ชื่ออังกฤษ');
  const engLast = fields.find((f) => f.id === 'นามสกุลอังกฤษ');
  if (!engFirst || !engLast) return fields;

  const rest = fields.filter((f) => f.id !== 'ชื่ออังกฤษ' && f.id !== 'นามสกุลอังกฤษ');
  const lastNameIdx = rest.findIndex((f) => f.id === 'ชื่อสกุล');
  if (lastNameIdx === -1) return fields;

  const result = [...rest];
  result.splice(lastNameIdx + 1, 0, engFirst, engLast);
  return result;
}

async function run() {
  for (const schemaId of ['emp_indirect', 'emp_direct_leader']) {
    const ref = doc(db, 'CMG-HR-Database', 'root', 'module_schemas', schemaId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const fields = snap.data().fields || [];
    const newFields = moveAfterLastName(fields);
    await setDoc(ref, { fields: newFields }, { merge: true });
    console.log(`✅ ${schemaId}: ย้าย ชื่ออังกฤษ/นามสกุลอังกฤษ ไปต่อจาก ชื่อสกุล แล้ว`);
    console.log('   ลำดับใหม่:', newFields.map((f) => f.id).join(' > '));
  }
  console.log('\n🎉 เสร็จสิ้น');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
