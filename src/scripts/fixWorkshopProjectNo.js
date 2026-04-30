/**
 * สคริปต์แก้ไขข้อมูล "สถานะโครงการ" ที่ใช้ชื่อโครงการแทน project_no
 * เช่น PRJ-2026-J-Workshop → PRJ-2026-J-002
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
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

async function fixWorkshopProjectNo() {
  console.log('🔍 เริ่มตรวจสอบข้อมูล...\n');

  try {
    // 1. ดึงข้อมูลโครงการทั้งหมดเพื่อสร้าง mapping
    console.log('📋 กำลังโหลดข้อมูลโครงการ...');
    const projectsSnap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'projects'));
    
    // สร้าง mapping: project_name → project_no
    const projectMapping = {};
    projectsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.project_name && data.project_no) {
        // เก็บทั้งชื่อเต็มและชื่อย่อ
        projectMapping[data.project_name.toLowerCase()] = data.project_no;
        projectMapping[data.project_no.toLowerCase()] = data.project_no;
        
        // เก็บรูปแบบที่มี " - " ด้วย
        const fullFormat = `${data.project_no} - ${data.project_name}`;
        projectMapping[fullFormat.toLowerCase()] = data.project_no;
      }
    });

    console.log(`✅ โหลดโครงการสำเร็จ: ${Object.keys(projectMapping).length / 3} โครงการ\n`);

    // 2. ดึงข้อมูลพนักงานทั้งหมด
    console.log('👥 กำลังโหลดข้อมูลพนักงาน...');
    const employeesSnap = await getDocs(collection(db, 'CMG-HR-Database', 'root', 'employee_data'));
    
    let totalEmployees = 0;
    let needsUpdate = 0;
    const updates = [];

    // 3. ตรวจสอบและเตรียมข้อมูลที่ต้องแก้ไข
    employeesSnap.docs.forEach(docSnap => {
      totalEmployees++;
      const data = docSnap.data();
      const projectStatus = data['สถานะโครงการ'];
      
      if (!projectStatus) return;

      const projects = Array.isArray(projectStatus) ? projectStatus : [projectStatus];
      const fixedProjects = [];
      let hasChanges = false;

      projects.forEach(proj => {
        const projStr = String(proj);
        
        // ตรวจสอบว่าเป็นรูปแบบที่ถูกต้องหรือไม่ (PRJ-YYYY-X-NNN)
        const isValidFormat = /^PRJ-\d{4}-[A-Z]-\d{3}$/.test(projStr.split(' - ')[0]);
        
        if (!isValidFormat) {
          // ลองหา project_no ที่ถูกต้อง
          const correctProjectNo = projectMapping[projStr.toLowerCase()];
          
          if (correctProjectNo) {
            console.log(`  🔧 ${docSnap.id}: "${projStr}" → "${correctProjectNo}"`);
            fixedProjects.push(correctProjectNo);
            hasChanges = true;
          } else {
            console.log(`  ⚠️  ${docSnap.id}: ไม่พบโครงการ "${projStr}" ในระบบ`);
            fixedProjects.push(projStr); // เก็บค่าเดิมไว้
          }
        } else {
          fixedProjects.push(projStr);
        }
      });

      if (hasChanges) {
        needsUpdate++;
        updates.push({
          id: docSnap.id,
          ref: doc(db, 'CMG-HR-Database', 'root', 'employee_data', docSnap.id),
          oldValue: projects,
          newValue: fixedProjects.length === 1 ? fixedProjects[0] : fixedProjects,
        });
      }
    });

    console.log(`\n📊 สรุปผลการตรวจสอบ:`);
    console.log(`   - พนักงานทั้งหมด: ${totalEmployees} คน`);
    console.log(`   - ต้องแก้ไข: ${needsUpdate} คน\n`);

    if (updates.length === 0) {
      console.log('✅ ไม่มีข้อมูลที่ต้องแก้ไข');
      return;
    }

    // 4. ถามยืนยันก่อนแก้ไข
    console.log('⚠️  กำลังจะอัพเดทข้อมูล...');
    console.log('   หากต้องการดำเนินการต่อ ให้รันคำสั่ง: node src/scripts/fixWorkshopProjectNo.js --confirm\n');

    // ตรวจสอบว่ามี --confirm flag หรือไม่
    if (!process.argv.includes('--confirm')) {
      console.log('ℹ️  ยกเลิกการอัพเดท (ใช้ --confirm เพื่อยืนยัน)');
      return;
    }

    // 5. ทำการอัพเดท
    console.log('🚀 เริ่มอัพเดทข้อมูล...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      try {
        await updateDoc(update.ref, {
          'สถานะโครงการ': update.newValue,
        });
        successCount++;
        console.log(`✅ ${update.id}: อัพเดทสำเร็จ`);
      } catch (error) {
        errorCount++;
        console.error(`❌ ${update.id}: เกิดข้อผิดพลาด`, error.message);
      }
    }

    console.log(`\n🎉 เสร็จสิ้น!`);
    console.log(`   - สำเร็จ: ${successCount} คน`);
    console.log(`   - ล้มเหลว: ${errorCount} คน`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
}

// รันสคริปต์
fixWorkshopProjectNo()
  .then(() => {
    console.log('\n✅ สคริปต์ทำงานเสร็จสิ้น');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ สคริปต์เกิดข้อผิดพลาด:', error);
    process.exit(1);
  });
