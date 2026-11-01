/**
 * Backfill ครั้งเดียว: คัดลอก attachments ของ "วราไพร อรุณวัน" (DC3121) จาก
 * recruitment_pending_employees (giq35RvKQSt8so2H7wWQ) ไปที่ employee_data/DC3121
 * เพราะตอนนำเข้าตอนแรก โค้ดยังไม่ได้ copy attachments มาด้วย (แก้ไว้แล้วใน RecruitmentIntakePage.tsx)
 *
 * รัน: node src/scripts/backfillDc3121Attachments.js
 */
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc',
  authDomain: 'cmg-hr-database.firebaseapp.com',
  projectId: 'cmg-hr-database',
  storageBucket: 'cmg-hr-database.firebasestorage.app',
  messagingSenderId: '625046761441',
  appId: '1:625046761441:web:22493e0b56a984cf5daca0',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const pendingRef = doc(db, 'CMG-HR-Database', 'root', 'recruitment_pending_employees', 'giq35RvKQSt8so2H7wWQ');
  const pendingSnap = await getDoc(pendingRef);
  if (!pendingSnap.exists()) {
    console.log('ไม่พบ pending record ต้นทาง');
    return;
  }
  const pendingData = pendingSnap.data();
  const attachments = pendingData.attachments || [];
  console.log(`พบ attachments ต้นทาง ${attachments.length} ไฟล์:`, attachments.map((a) => a.name));

  if (attachments.length === 0) {
    console.log('ไม่มี attachments ให้ backfill');
    return;
  }

  const empRef = doc(db, 'CMG-HR-Database', 'root', 'employee_data', 'DC3121');
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) {
    console.log('ไม่พบ employee_data/DC3121');
    return;
  }
  const existing = empSnap.data().attachments || [];
  console.log(`employee_data/DC3121 มี attachments เดิมอยู่แล้ว ${existing.length} ไฟล์`);

  await setDoc(empRef, { attachments }, { merge: true });
  console.log('✅ backfill attachments เข้า employee_data/DC3121 สำเร็จ');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ เกิดข้อผิดพลาด:', err);
    process.exit(1);
  });
