// Initialize Firebase Database with Mock Data - Correct Structure
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBkufl0G5RG0Kl9NwGUty9KONciRmh3Ews",
  authDomain: "master-databasse-cmg.firebaseapp.com",
  projectId: "master-databasse-cmg",
  storageBucket: "master-databasse-cmg.firebasestorage.app",
  messagingSenderId: "564913926048",
  appId: "1:564913926048:web:c37a11f99cc214ec4a7ec5",
  measurementId: "G-R688E2PTCE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mock Employee Data
const mockEmployeeData = [
  {
    id: "EMP001",
    รหัสพนักงาน: "EMP001",
    โครงการ: "โครงการ A",
    ชื่อต้น: "นาย",
    ชื่อตัว: "สมชาย",
    ชื่อสกุล: "ใจดี",
    ตำแหน่ง: "หัวหน้าทีม",
    แผนก: "IT",
    Type: "Full-time",
    employee_type: "Indirect"
  },
  {
    id: "EMP002",
    รหัสพนักงาน: "EMP002",
    โครงการ: "โครงการ B",
    ชื่อต้น: "นาง",
    ชื่อตัว: "สมใส",
    ชื่อสกุล: "รักงาน",
    ตำแหน่ง: "ผู้จัดการ",
    แผนก: "HR",
    Type: "Full-time",
    employee_type: "Direct_TeamLeader"
  },
  {
    id: "EMP003",
    รหัสพนักงาน: "EMP003",
    โครงการ: "โครงการ C",
    ชื่อต้น: "นางสาว",
    ชื่อตัว: "สมศรี",
    ชื่อสกุล: "ขยันทำ",
    ตำแหน่ง: "พนักงาน",
    แผนก: "Supply",
    Type: "Contract",
    employee_type: "Direct_SupplyDC"
  },
  {
    id: "EMP004",
    รหัสพนักงาน: "EMP004",
    โครงการ: "โครงการ D",
    ชื่อต้น: "นาย",
    ชื่อตัว: "สมปอง",
    ชื่อสกุล: "มานะ",
    ตำแหน่ง: "ช่างเทคนิค",
    แผนก: "Production",
    Type: "Part-time",
    employee_type: "Direct_SubContractor"
  }
];

// Mock Users Data
const mockUsersData = [
  {
    id: "admin",
    uid: "admin",
    username: "ผู้ดูแลระบบ",
    role: "Admin"
  },
  {
    id: "viewer1",
    uid: "viewer1",
    username: "ผู้ใช้ทั่วไป",
    role: "Viewer"
  }
];

// Mock Activity Logs
const mockActivityLogs = [
  {
    id: "LOG001",
    timestamp: new Date().toLocaleString("th-TH"),
    user: "admin@cmg.com",
    module: "emp_indirect",
    action: "เพิ่มใหม่",
    details: "เพิ่มพนักงาน EMP001",
    createdAt: Date.now() - 3600000
  },
  {
    id: "LOG002",
    timestamp: new Date().toLocaleString("th-TH"),
    user: "admin@cmg.com",
    module: "users_data",
    action: "ปรับโครงสร้าง",
    details: "เพิ่มคอลัมน์ใหม่",
    createdAt: Date.now() - 1800000
  }
];

// Employee Schema
const employeeSchema = {
  fields: [
    { id: "รหัสพนักงาน", label: "รหัสพนักงาน", type: "text", required: true },
    { id: "โครงการ", label: "โครงการ", type: "text" },
    {
      id: "ชื่อต้น",
      label: "ชื่อต้น",
      type: "select",
      options: ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."],
    },
    { id: "ชื่อตัว", label: "ชื่อตัว", type: "text", required: true },
    { id: "ชื่อสกุล", label: "ชื่อสกุล", type: "text", required: true },
    { id: "ตำแหน่ง", label: "ตำแหน่ง", type: "text" },
    { id: "แผนก", label: "แผนก", type: "text" },
    {
      id: "Type",
      label: "Type",
      type: "select",
      options: ["Full-time", "Part-time", "Contract"],
    },
    {
      id: "employee_type",
      label: "Employee Type",
      type: "select",
      options: ["Indirect", "Direct_TeamLeader", "Direct_SupplyDC", "Direct_SubContractor"],
    },
  ]
};

// Users Schema
const usersSchema = {
  fields: [
    { id: "uid", label: "User ID", type: "text", required: true },
    { id: "username", label: "ชื่อผู้ใช้", type: "text", required: true },
    {
      id: "role",
      label: "สิทธิ์การใช้งาน",
      type: "select",
      options: ["Admin", "Viewer"],
    },
  ]
};

// Activity Logs Schema
const activityLogsSchema = {
  fields: [
    { id: "timestamp", label: "เวลา", type: "text", required: true },
    { id: "user", label: "ผู้ใช้", type: "text", required: true },
    { id: "module", label: "โมดูล", type: "text", required: true },
    { id: "action", label: "การกระทำ", type: "text", required: true },
    { id: "details", label: "รายละเอียด", type: "text", required: true },
    { id: "createdAt", label: "Created At", type: "number", required: true },
  ]
};

async function initializeFirebaseData() {
  try {
    console.log("Initializing Firebase database with correct structure...");

    // Structure: CMG-HR-Database/root/{subcollection}

    // Create employee data
    for (const employee of mockEmployeeData) {
      await setDoc(doc(db, "CMG-HR-Database", "root", "employee_data", employee.id), employee);
      console.log(`Added employee: ${employee.รหัสพนักงาน}`);
    }

    // Create users data
    for (const user of mockUsersData) {
      await setDoc(doc(db, "CMG-HR-Database", "root", "users_data", user.id), user);
      console.log(`Added user: ${user.username}`);
    }

    // Create activity logs
    for (const log of mockActivityLogs) {
      await setDoc(doc(db, "CMG-HR-Database", "root", "activity_logs", log.id), log);
      console.log(`Added log: ${log.id}`);
    }

    // Create schemas
    await setDoc(doc(db, "CMG-HR-Database", "root", "employee_data", "_schema_metadata"), employeeSchema);
    await setDoc(doc(db, "CMG-HR-Database", "root", "users_data", "_schema_metadata"), usersSchema);
    await setDoc(doc(db, "CMG-HR-Database", "root", "activity_logs", "_schema_metadata"), activityLogsSchema);

    console.log("✅ Database initialization completed successfully!");
    console.log("📊 Database Structure:");
    console.log("CMG-HR-Database/");
    console.log("└── root/");
    console.log("    ├── employee_data/ (4 employees + schema)");
    console.log("    ├── users_data/ (2 users + schema)");
    console.log("    └── activity_logs/ (2 logs + schema)");
    
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

// Run initialization
initializeFirebaseData();
