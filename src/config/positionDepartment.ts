// ตำแหน่งหนึ่งมีแผนกหลักเดียว ใช้ทั้งแดชบอร์ด ฟอร์มพนักงาน และสคริปต์ปรับข้อมูลเดิม
// สคริปต์ scripts/bindPositionDepartment.js ต้องใช้รายการชุดเดียวกัน

export const POSITION_DEPARTMENT: Record<string, string> = {
  "ช่างไม้/ช่างปูน": "Site Labor",
  "ผู้ช่วยช่าง": "Site Labor",
  "ช่างตัดเสาเข็ม": "Site Labor",
  "Foreman": "Site Labor",
  "Fire Watch": "Safety",
  "นักศึกษาฝึกงาน": "Intern",
  "Survey Assistant": "Survey",
  "ผู้ช่วย Survey": "Survey",
  "QC Engineer": "Quality control",
  "Supervisor rigger": "Rigger",
  "Rigger": "Rigger",
  "ช่างไฟฟ้า": "Electrical",
  "Checker": "Checker",
  "Admin - ล่ามจีน": "Administration",
  "ล่ามพม่า": "Administration",
  "Interpreter": "Administration",
  "Survey": "Survey",
  "Safety Technical": "Safety",
  "Site Engineer": "Construction",
  "พนักงานขับรถ": "Transportation",
  "คนขับรถ": "Transportation",
  "Foreman Rigger": "Rigger",
  "Supervisor survey": "Survey",
  "HR": "Human resource",
  "HR Assit": "Human resource",
  "HR Admin": "Human resource",
  "HRD": "Human resource",
  "HR manager": "Human resource",
  "Secretary": "Human resource",
};

export const POSITION_RENAMES: Record<string, string> = {
  "ผู้ช่วย Survey": "Survey Assistant",
  "Fire watch": "Fire Watch",
  "คนขับรถ": "พนักงานขับรถ",
  "Safety technical": "Safety Technical",
};

const J074_PROJECT_KEY = "prj-2026-j-074";

export const projectNoKey = (value: string | null | undefined): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const separator = " - ";
  const idx = raw.indexOf(separator);
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim().toLowerCase();
};

export const isJ074Project = (value: string | null | undefined): boolean => {
  const key = projectNoKey(value);
  return key === J074_PROJECT_KEY || key.endsWith("-j-074");
};

const renameKey = (position: string): string => {
  if (POSITION_RENAMES[position]) return POSITION_RENAMES[position];
  const lower = position.toLowerCase();
  const match = Object.entries(POSITION_RENAMES).find(([from]) => from.toLowerCase() === lower);
  return match ? match[1] : position;
};

export const canonicalPositionName = (
  position: string,
  projects: Array<string | null | undefined> = []
): string => {
  const raw = String(position || "").trim();
  if (!raw || raw === "ไม่ระบุ") return "";
  if (raw.toLowerCase() === "interpreter") {
    return projects.some((project) => isJ074Project(project)) ? "ล่ามพม่า" : "Admin - ล่ามจีน";
  }
  return renameKey(raw);
};

export const departmentForPosition = (
  position: string,
  projects: Array<string | null | undefined> = []
): string => {
  const canonical = canonicalPositionName(position, projects);
  if (canonical && POSITION_DEPARTMENT[canonical]) return POSITION_DEPARTMENT[canonical];
  const raw = String(position || "").trim();
  return POSITION_DEPARTMENT[raw] || "";
};

export const normalizeStoredDepartment = (department: string): string => {
  const raw = String(department || "").trim();
  if (!raw || raw === "ไม่ระบุ") return "";
  if (raw === "HR") return "Human resource";
  return raw;
};

// แผนกจาก position_labor มาก่อน แล้วจึงเป็นแผนที่ในโค้ด ถ้าตำแหน่งไม่มีแผนกหลักจึงใช้ค่าที่บันทึกในพนักงาน
export const resolveEmployeeDepartment = (
  position: string,
  projects: Array<string | null | undefined>,
  storedDepartment: string,
  masterDepartments: Record<string, string> = {}
): { position: string; department: string } => {
  const canonical = canonicalPositionName(position, projects);
  const positionLabel = canonical || (String(position || "").trim() && String(position || "").trim() !== "ไม่ระบุ"
    ? String(position || "").trim()
    : "ไม่ระบุ");
  const master = canonical ? String(masterDepartments[canonical] || "").trim() : "";
  const fromCode = canonical ? POSITION_DEPARTMENT[canonical] || "" : departmentForPosition(position, projects);
  const stored = normalizeStoredDepartment(storedDepartment);
  const department = master || fromCode || stored || "ไม่ระบุ";
  return { position: positionLabel, department };
};
