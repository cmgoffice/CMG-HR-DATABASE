import { GMTP_TRAINING_MATRIX } from "./gmtpTrainingMatrixData";
import type { ProjectDocumentRequirement } from "./projectDocumentConfig";

export const GMTP_MATRIX_ROLES = GMTP_TRAINING_MATRIX.roles;
export const GMTP_MATRIX_COURSES = GMTP_TRAINING_MATRIX.courses;
export const getGmtpMatrixCourse = (name: string) => GMTP_MATRIX_COURSES.find((course) => course.name === name);

export const GMTP_COMBINED_ROLE = "Carpenter + Painter + Mason";
const companyRoles: Record<string, string> = { "ช่างไม้/ช่างปูน": GMTP_COMBINED_ROLE, "ช่างเชื่อม": "Welder" };
const expandRole = (role: string): string[] => role === GMTP_COMBINED_ROLE ? ["Carpenter", "Painter", "Mason"] : [role];
export const getGmtpRoleCourses = (role: string) => GMTP_MATRIX_COURSES.filter((course) => expandRole(role).some((item) => course.roles.includes(item)));

export const getGmtpCourseEnrollments = <T extends { position?: string; matrixRole?: string }>(enrollments: T[], courseName: string): T[] => {
  const course = getGmtpMatrixCourse(courseName);
  return enrollments.filter((en) => expandRole(resolveGmtpMatrixRole(en.position, en.matrixRole)).some((role) => course?.roles.includes(role)));
};

// Only exact source role names are inferred. HR selects the matrix role for other job titles.
export const resolveGmtpMatrixRole = (position: string | undefined, selected?: string): string =>
  selected ? ([...GMTP_MATRIX_ROLES, GMTP_COMBINED_ROLE].includes(selected) ? selected : "")
    : companyRoles[(position || "").trim()] || GMTP_MATRIX_ROLES.find((role) => role.toLowerCase() === (position || "").trim().toLowerCase()) || "";

export const gmtpMatrixRoleMessage = (courseName: string, role: string): string => {
  const course = getGmtpMatrixCourse(courseName);
  if (!course) return "กรุณาเลือกชื่อคอร์สตาม Training Matrix 74";
  if (!role) return "กรุณาจับคู่ตำแหน่งกับ Training Matrix 74";
  return course.roles.includes(role) ? "ตำแหน่งนี้ต้องอบรมตาม Matrix" : "Matrix ไม่ได้ทำเครื่องหมาย X สำหรับตำแหน่งนี้";
};

const certificates = [
  { id: "safety_6h", label: "ใบเซอร์อบรมความปลอดภัย 6 ชม.", match: /6\s*(ชม|ชั่วโมง|h)|safety_6h/i, course: "SHE Induction", roles: [] },
  { id: "scaffolding", label: "ใบเซอร์นั่งร้าน", match: /นั่งร้าน|scaffold/i, course: "Scaffolding Awareness", roles: ["Scaffolder"] },
  { id: "electrical", label: "ใบเซอร์ช่างไฟฟ้า", match: /ช่างไฟฟ้า|electrical/i, course: "Electrical and Power Tools Safety", roles: ["Electrician"] },
  { id: "fire_watch", label: "ใบเซอร์ Fire Watch", match: /fire[ _]*watch/i, course: "Fire Watch Awareness", roles: [] },
  { id: "basic_fire", label: "ใบเซอร์ Basic Fire", match: /basic[ _]*fire|ดับเพลิงขั้นต้น/i, course: "Fire Watch Awareness", roles: [] },
  { id: "lifting", label: "ใบเซอร์งานยก", match: /งานยก|lifting/i, course: "Lifting Awareness", roles: ["Crane Operator", "Rigger"] },
  { id: "driving", label: "ใบขับขี่ที่เกี่ยวข้อง", match: /ใบขับขี่|driving[ _]*licen/i, course: "Defensive Driving", roles: [] },
  { id: "confined_space", label: "ใบเซอร์ Confined Space", match: /confined[ _]*space|ที่อับอากาศ/i, course: "Confined Space Entry Awareness", roles: [] },
];

export const gmtpDocumentRequirements = (
  base: ProjectDocumentRequirement[], courseName: string, role: string
): ProjectDocumentRequirement[] => {
  if (!getGmtpMatrixCourse(courseName)) return base;
  const matches = (req: ProjectDocumentRequirement, pattern: RegExp) => pattern.test(`${req.docType} ${req.label}`);
  const result = base.filter((req) => !certificates.some((cert) => matches(req, cert.match)) && !matches(req, /งานที่สูง|working[ _]*at[ _]*height/i));
  certificates.filter((cert) => cert.course === courseName && (!cert.roles.length || cert.roles.includes(role))).forEach((cert) => {
    const existing = base.filter((req) => matches(req, cert.match));
    const required: ProjectDocumentRequirement[] = existing.length ? existing : [{ docType: `gmtp_${cert.id}`, label: cert.label, appliesTo: "all" }];
    required.forEach((req) => {
      if (!result.some((item) => item.docType === req.docType)) {
        result.push({ ...req, fulfillmentType: "employee_upload", altGroupId: undefined });
      }
    });
  });
  return result;
};

export const gmtpRoundDocumentRequirements = (base: ProjectDocumentRequirement[], role: string): ProjectDocumentRequirement[] => {
  const requirements = new Map(gmtpDocumentRequirements(base, "Visitor Induction", role).map((req) => [req.docType, req]));
  getGmtpRoleCourses(role).forEach((course) => {
    gmtpDocumentRequirements(base, course.name, role).forEach((req) => requirements.set(req.docType, req));
  });
  return Array.from(requirements.values());
};
