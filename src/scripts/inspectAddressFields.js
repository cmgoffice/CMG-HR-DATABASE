/**
 * สคริปต์ตรวจสอบ (read-only) หาฟิลด์ที่เกี่ยวกับ "ที่อยู่" ในข้อมูลพนักงาน
 * ใช้เพื่อออกแบบ mapping ไปยังฟอร์ม Access Badge Request
 *
 * รัน: node src/scripts/inspectAddressFields.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

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

async function run() {
  console.log('\n=== ตรวจสอบ schema_metadata ของ employee_data ===\n');
  try {
    const schemaDoc = await getDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', '_schema_metadata'));
    if (schemaDoc.exists()) {
      const data = schemaDoc.data();
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('ไม่พบ _schema_metadata เป็น document แยก (อาจเก็บ schema ไว้ที่อื่น เช่น settings/schemas)');
    }
  } catch (e) {
    console.log('อ่าน schema_metadata ไม่สำเร็จ:', e.message);
  }

  console.log('\n=== สแกนฟิลด์ที่เกี่ยวกับ "ที่อยู่" ในเอกสารพนักงานจริง ===\n');
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  console.log(`โหลดพนักงานทั้งหมด: ${snap.size} เอกสาร\n`);

  const candidateKeys = new Set();
  snap.docs.forEach((docSnap) => {
    if (SKIP_DOC_IDS.has(docSnap.id)) return;
    const data = docSnap.data();
    Object.keys(data).forEach((key) => {
      if (/ที่อยู่|บ้านเลขที่|หมู่|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ไปรษณีย์|address|province|district|subdistrict|zipcode|postcode/i.test(key)) {
        candidateKeys.add(key);
      }
    });
  });

  if (candidateKeys.size === 0) {
    console.log('⚠️  ไม่พบฟิลด์ใดที่มีชื่อเกี่ยวกับ "ที่อยู่" ในเอกสารพนักงานเลย');
    return;
  }

  console.log(`พบฟิลด์ที่เกี่ยวข้อง (${candidateKeys.size}): ${Array.from(candidateKeys).map((k) => `"${k}"`).join(', ')}\n`);

  candidateKeys.forEach((key) => {
    let filledCount = 0;
    let emptyCount = 0;
    const samples = [];
    snap.docs.forEach((docSnap) => {
      if (SKIP_DOC_IDS.has(docSnap.id)) return;
      const data = docSnap.data();
      const raw = data[key];
      const value = String(raw ?? '').trim();
      if (!value) {
        emptyCount++;
        return;
      }
      filledCount++;
      if (samples.length < 3) samples.push(value);
    });

    console.log(`--- ฟิลด์: "${key}" ---`);
    console.log(`  มีค่า: ${filledCount} คน | ว่าง: ${emptyCount} คน`);
    console.log(`  ตัวอย่างค่า: ${samples.map((s) => JSON.stringify(s)).join(' | ')}`);
    console.log('');
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
