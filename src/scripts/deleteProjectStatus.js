// Script to delete all "สถานะโครงการ" data from all employees
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from "firebase/firestore";
import readline from 'readline';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc",
  authDomain: "cmg-hr-database.firebaseapp.com",
  projectId: "cmg-hr-database",
  storageBucket: "cmg-hr-database.firebasestorage.app",
  messagingSenderId: "625046761441",
  appId: "1:625046761441:web:22493e0b56a984cf5daca0",
  measurementId: "G-Z8DWB4YM0S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask for confirmation
function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Main function to delete project status
async function deleteProjectStatusFromAllEmployees() {
  try {
    console.log('🔍 กำลังค้นหาข้อมูลพนักงานทั้งหมด...');
    
    // Get reference to employee_data collection
    const employeeDataRef = collection(db, "CMG-HR-Database", "root", "employee_data");
    
    // Get all employee documents
    const querySnapshot = await getDocs(employeeDataRef);
    
    if (querySnapshot.empty) {
      console.log('❌ ไม่พบข้อมูลพนักงานในระบบ');
      rl.close();
      return;
    }
    
    console.log(`📊 พบข้อมูลพนักงานทั้งหมด ${querySnapshot.size} รายการ`);
    
    // Show confirmation prompt
    const confirmed = await askConfirmation('\n⚠️  คุณแน่ใจหรือไม่ที่จะลบข้อมูล "สถานะโครงการ" ของพนักงานทั้งหมด? (y/n): ');
    
    if (!confirmed) {
      console.log('❌ ยกเลิกการดำเนินการ');
      rl.close();
      return;
    }
    
    console.log('\n🔄 กำลังดำเนินการลบข้อมูล...');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each employee document
    for (const docSnapshot of querySnapshot.docs) {
      const employeeId = docSnapshot.id;
      const employeeData = docSnapshot.data();
      
      try {
        // Check if the employee has "สถานะโครงการ" field
        if ('สถานะโครงการ' in employeeData) {
          // Delete the field using deleteField()
          const employeeRef = doc(db, "CMG-HR-Database", "root", "employee_data", employeeId);
          await updateDoc(employeeRef, {
            'สถานะโครงการ': deleteField()
          });
          
          console.log(`✅ ลบข้อมูลสถานะโครงการของ ${employeeId} สำเร็จ`);
          successCount++;
        } else {
          console.log(`ℹ️  ${employeeId} ไม่มีข้อมูลสถานะโครงการ`);
        }
      } catch (error) {
        console.error(`❌ เกิดข้อผิดพลาดในการลบข้อมูลของ ${employeeId}:`, error.message);
        errors.push({ employeeId, error: error.message });
        errorCount++;
      }
    }
    
    // Summary
    console.log('\n📋 สรุปผลการดำเนินการ:');
    console.log(`✅ ลบสำเร็จ: ${successCount} รายการ`);
    console.log(`❌ เกิดข้อผิดพลาด: ${errorCount} รายการ`);
    
    if (errors.length > 0) {
      console.log('\n❌ รายละเอียดข้อผิดพลาด:');
      errors.forEach(({ employeeId, error }) => {
        console.log(`   - ${employeeId}: ${error}`);
      });
    }
    
    console.log('\n✅ ดำเนินการเสร็จสิ้น');
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดร้ายแรง:', error);
  } finally {
    rl.close();
    process.exit();
  }
}

// Run the script
console.log('🚀 Script สำหรับลบข้อมูล "สถานะโครงการ" ของพนักงานทั้งหมด');
console.log('================================================');
deleteProjectStatusFromAllEmployees();
