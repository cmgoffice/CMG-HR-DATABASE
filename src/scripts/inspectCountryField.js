/**
 * สคริปต์ตรวจสอบ (read-only) หาฟิลด์ที่เกี่ยวกับ "ประเทศ" ในข้อมูลพนักงาน
 * และค่าที่ใช้จริง เพื่อใช้ออกแบบ logic แปลงเป็นฟิลด์ "สัญชาติ"
 *
 * รัน: node src/scripts/inspectCountryField.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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
  console.log('\n=== ตรวจสอบฟิลด์ที่เกี่ยวกับ "ประเทศ" / "สัญชาติ" ในข้อมูลพนักงาน ===\n');

  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  console.log(`โหลดพนักงานทั้งหมด: ${snap.size} เอกสาร\n`);

  const candidateKeys = new Set();
  snap.docs.forEach((docSnap) => {
    if (SKIP_DOC_IDS.has(docSnap.id)) return;
    const data = docSnap.data();
    Object.keys(data).forEach((key) => {
      if (/ประเทศ|country|สัญชาติ|nationality/i.test(key)) {
        candidateKeys.add(key);
      }
    });
  });

  if (candidateKeys.size === 0) {
    console.log('⚠️  ไม่พบฟิลด์ใดที่มีชื่อเกี่ยวกับ "ประเทศ"/"สัญชาติ" ในเอกสารพนักงานเลย');
    console.log('    (อาจต้องเปิดหน้าจัดการฟิลด์ในระบบเพื่อดูชื่อฟิลด์ที่ถูกต้อง)\n');
    return;
  }

  console.log(`พบฟิลด์ที่เกี่ยวข้อง: ${Array.from(candidateKeys).map((k) => `"${k}"`).join(', ')}\n`);

  candidateKeys.forEach((key) => {
    const valueCounts = {};
    let filledCount = 0;
    let emptyCount = 0;
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
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    });

    console.log(`--- ฟิลด์: "${key}" ---`);
    console.log(`  มีค่า: ${filledCount} คน | ว่าง: ${emptyCount} คน`);
    console.log(`  ค่าที่พบทั้งหมด (เรียงตามจำนวนมาก->น้อย):`);
    Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([value, count]) => console.log(`    "${value}" : ${count} คน`));
    console.log('');
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
