/**
 * แก้ไข 5 เคสที่เหลือจากการตรวจสอบที่อยู่ (ยืนยันแล้วว่าแก้ไขได้ชัดเจน)
 * รัน: node src/scripts/fixRemaining5Addresses.js
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
  '670262': { 'แขวงตำบล': 'ตำบลมาบข่า', 'ไปรษณีย์': '21180' },
  'DC2181': { 'แขวงตำบล': 'ตำบลผาจุก', 'ไปรษณีย์': '53000' },
  'DC2980': { 'เขตอำเภอ': 'อำเภอนาแก', 'แขวงตำบล': 'ตำบลหนองบ่อ', 'ไปรษณีย์': '48130' },
  'DC3046': { 'แขวงตำบล': 'ตำบลเพ', 'ไปรษณีย์': '21160' },
  'DC3110': { 'เขตอำเภอ': 'อำเภอเสลภูมิ', 'แขวงตำบล': 'ตำบลโพธิ์ทอง', 'ไปรษณีย์': '45120' },
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
