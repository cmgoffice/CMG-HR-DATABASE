const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, updateDoc, deleteField } = require('firebase/firestore');
require('dotenv').config();

// Firebase config (ใช้จาก .env)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixEmployeeId() {
  console.log('🔍 เริ่มตรวจสอบข้อมูล...\n');
  try {
    const employeesSnap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
    let totalEmployees = 0;
    let needsUpdate = 0;
    const actions = [];

    employeesSnap.docs.forEach(docSnap => {
      totalEmployees++;
      const data = docSnap.data();
      const docId = docSnap.id;
      const empCode = data['รหัสพนักงาน'];
      const hasIdField = data.hasOwnProperty('id');

      let action = null;

      // 1. ถ้า doc.id ไม่ตรงกับ 'รหัสพนักงาน' (และมี 'รหัสพนักงาน' ให้ใช้)
      if (empCode && docId !== empCode) {
        action = { type: 'RECREATE', oldId: docId, newId: empCode, data: { ...data } };
        delete action.data.id; // ลบฟิลด์ id ออก
        actions.push(action);
        needsUpdate++;
        console.log(`  🔄 ต้องเปลี่ยน Document ID: "${docId}" → "${empCode}"`);
      } 
      // 2. ถ้า doc.id ตรงกันแล้ว แต่มีฟิลด์ 'id' ค้างอยู่
      else if (hasIdField) {
        action = { type: 'DELETE_FIELD', id: docId, ref: doc(db, 'CMG-HR-Database', 'root', 'employee_data', docId) };
        actions.push(action);
        needsUpdate++;
        console.log(`  🗑️ ต้องลบฟิลด์ id ใน Document: "${docId}"`);
      }
    });

    console.log(`\n📊 สรุปผลการตรวจสอบ:`);
    console.log(`   - พนักงานทั้งหมด: ${totalEmployees} คน`);
    console.log(`   - ต้องแก้ไข: ${needsUpdate} คน\n`);

    if (actions.length === 0) {
      console.log('✅ ไม่มีข้อมูลที่ต้องแก้ไข');
      return;
    }

    if (!process.argv.includes('--confirm')) {
      console.log('ℹ️  กำลังจะดำเนินการแก้ไข หากต้องการดำเนินการจริง ให้รัน: node src/scripts/fixEmployeeId.js --confirm');
      return;
    }

    console.log('🚀 เริ่มแก้ไขข้อมูล...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const action of actions) {
      try {
        if (action.type === 'RECREATE') {
          // สร้าง doc ใหม่
          await setDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', action.newId), action.data);
          // ลบ doc เก่า
          await deleteDoc(doc(db, 'CMG-HR-Database', 'root', 'employee_data', action.oldId));
          console.log(`✅ สำเร็จ: เปลี่ยน ID "${action.oldId}" → "${action.newId}"`);
        } else if (action.type === 'DELETE_FIELD') {
          await updateDoc(action.ref, { id: deleteField() });
          console.log(`✅ สำเร็จ: ลบฟิลด์ id ใน "${action.id}"`);
        }
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`❌ ผิดพลาดที่ ${action.oldId || action.id}:`, error.message);
      }
    }

    console.log(`\n🎉 เสร็จสิ้น!`);
    console.log(`   - สำเร็จ: ${successCount} คน`);
    console.log(`   - ล้มเหลว: ${errorCount} คน`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
}

fixEmployeeId()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
