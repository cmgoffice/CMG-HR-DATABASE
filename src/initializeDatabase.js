// Initialize Firebase Database with Mock Data
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB4nIgikGx6xMsSWOMfJsKWta1bfPmVTcc",
  authDomain: "cmg-hr-database.firebaseapp.com",
  projectId: "cmg-hr-database",
  storageBucket: "cmg-hr-database.firebasestorage.app",
  messagingSenderId: "625046761441",
  appId: "1:625046761441:web:22493e0b56a984cf5daca0",
  measurementId: "G-Z8DWB4YM0S"
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

async function initializeDatabase() {
  try {
    console.log("Initializing database...");

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

    // Create schemas
    await setDoc(doc(db, "CMG-HR-Database", "root", "employee_data", "_schema_metadata"), employeeSchema);
    await setDoc(doc(db, "CMG-HR-Database", "root", "users_data", "_schema_metadata"), usersSchema);

    // Create activity logs collection (empty for now)
    await setDoc(doc(db, "CMG-HR-Database", "root", "activity_logs", "_placeholder"), {
      message: "Activity logs collection initialized",
      timestamp: new Date().toISOString()
    });

    console.log("Database initialization completed successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Run initialization
initializeDatabase();
