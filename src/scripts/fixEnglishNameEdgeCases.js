/**
 * แก้ 5 เคสที่ตัดแยก ชื่อภาษาอื่น -> ชื่ออังกฤษ/นามสกุลอังกฤษ แบบอัตโนมัติได้ไม่สมบูรณ์:
 *   - 690276, HR001: ตัดคำนำหน้า "Mr."/"Miss." ที่ติดมากับชื่อออก
 *   - 690277, 690278: เป็นชื่อภาษาไทยที่ใส่ผิดช่อง ล้างชื่ออังกฤษ/นามสกุลอังกฤษออกทั้งคู่
 * รัน: node src/scripts/fixEnglishNameEdgeCases.js
 */
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc } = require('firebase/firestore');

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

const FIXES = {
  '690276': { ชื่ออังกฤษ: 'Kanokchnok' }, // ตัด "Miss." ออก
  'HR001': { ชื่ออังกฤษ: 'Settapol' }, // ตัด "Mr." ออก
  '690277': { ชื่ออังกฤษ: '', นามสกุลอังกฤษ: '' }, // เป็นชื่อไทย ไม่ใช่อังกฤษ ล้างออก
  '690278': { ชื่ออังกฤษ: '', นามสกุลอังกฤษ: '' }, // เป็นชื่อไทย ไม่ใช่อังกฤษ ล้างออก
};

async function run() {
  const snap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const empId = String(data['รหัสพนักงาน'] || d.id);
    if (FIXES[empId]) {
      await updateDoc(d.ref, FIXES[empId]);
      console.log(`✅ แก้ไข [${empId}]`, FIXES[empId]);
      count++;
    }
  }
  console.log(`\n🎉 แก้ไขสำเร็จ ${count}/${Object.keys(FIXES).length} คน`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
