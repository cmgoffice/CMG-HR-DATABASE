// ---------------------------------------------------------------------------
// Job Descriptions (ใบพรรณนางาน / JD + Job Matrix (RACI) + Skill Matrix)
//
// Firestore path: CMG-HR-Database/root/job_descriptions
//
// เอกสารนี้มี 2 แหล่งที่มา ใช้ schema เดียวกันทั้งหมด ต่างกันแค่ doc id prefix:
//   - ฝั่งระบบสรรหา (เขียนอยู่แล้ว, write-only จากฝั่งนั้น): doc id = `packet:{hiringPacketId}`
//     มี hiringPacketId เป็นค่าจริง, source = "recruitment"
//   - ฝั่ง Data (สร้าง/แก้เองสำหรับพนักงานเก่าที่ไม่ได้มาจากระบบสรรหา): doc id = `employee:{รหัสพนักงาน}`
//     hiringPacketId = null, มี employeeCode = รหัสพนักงาน (join กับ employee_data ตรงๆ), source = "data_team_manual"
//
// ⚠️ เอกสารที่มาจากระบบสรรหา (packet:) อาจถูกเขียนทับซ้ำ (merge) ได้เรื่อยๆ ถ้า HR แก้ไข JD ต้นทาง
// แล้วกดซิงค์ใหม่ — ถ้าทีม Data เคยแก้ไขเอกสารเดียวกันไว้ก่อนหน้า การซิงค์ใหม่อาจเขียนทับข้อมูลที่ Data
// แก้ไว้แบบเงียบๆ (merge ทับทั้ง field เช่น skillMatrix ทั้งก้อน ไม่ใช่ merge ราย item) จึงต้องเทียบ
// syncedAt (จากสรรหา) กับ dataTeamEditedAt (จาก Data) ตอนแสดงผล เพื่อเตือนผู้ใช้ให้ตรวจสอบซ้ำ
// ---------------------------------------------------------------------------

export const JOB_DESCRIPTIONS_COLLECTION = "job_descriptions";

export type JobDescriptionSource = "recruitment" | "data_team_manual" | string;

export type RaciValue = "R" | "A" | "C" | "I";

export const RACI_LABEL: Record<RaciValue, string> = {
  R: "Responsible (ผู้รับผิดชอบหลัก)",
  A: "Accountable (ผู้มีอำนาจตัดสินใจ/รับผิดชอบสูงสุด)",
  C: "Consulted (ผู้ให้คำปรึกษา)",
  I: "Informed (ผู้รับทราบ)",
};

/** 1 คนในหน้าที่หนึ่ง พร้อมตัวอักษร RACI ของตัวเอง — 1 หน้าที่มีได้หลายคนหลายบทบาทพร้อมกัน */
export interface StakeholderRaciEntry {
  raci: RaciValue | string;
  name: string;
}

/** รูปแบบจริงที่ระบบสรรหาใช้เก็บ RACI แยกรายคนตอนนี้ (field ชื่อ raciAssignments ไม่ใช่ stakeholders) */
export interface RaciAssignmentRaw {
  stakeholder?: string;
  raci?: string;
}

export interface ResponsibilityRow {
  id?: string;
  task?: string;
  kpi?: string;
  // รูปแบบเก่าที่สุด (ก่อนมี raciAssignments): RACI เดียวต่อหน้าที่ทั้งแถว — เก็บไว้เฉพาะอ่านเอกสารเก่า
  // เพื่อ migrate เท่านั้น ไม่เขียนทับใหม่แล้ว
  raci?: RaciValue | string;
  // รูปแบบเก่า (ก่อน raciAssignments): เจอได้ 3 แบบในข้อมูลจริง —
  //   1) string คั่นด้วยคอมมา บางคนมีวงเล็บกำกับ RACI ต่อท้าย เช่น "QA/QC Manager (A), Site Engineer (C)"
  //   2) array ของชื่อเฉยๆ ไม่มีบทบาทกำกับ (ใช้ raci เดิมของทั้งแถวกับทุกคน)
  //   3) array ของ {raci, name} (รูปแบบที่ฝั่ง Data เคยบันทึกเองจากฟอร์มนี้)
  // ต้องผ่าน migrateResponsibilityStakeholders() เสมอ ห้ามอ่านตรงๆ
  stakeholders?: StakeholderRaciEntry[] | string[] | string;
  // รูปแบบจริงปัจจุบันที่ระบบสรรหาใช้ (ข้อมูลที่ยืนยันจากของจริงใน Firestore 2026-11-09) — แต่ละคนมี
  // ตัวอักษร RACI ของตัวเอง field ชื่อ "stakeholder" ไม่ใช่ "name" — เป็นค่าหลักที่ต้องใช้ก่อนเสมอถ้ามี
  raciAssignments?: RaciAssignmentRaw[];
}

/**
 * แปลงผู้เกี่ยวข้อง+RACI ของหน้าที่หนึ่งให้เป็นรูปแบบเดียวที่ใช้แสดงผล/แก้ไขในแอปนี้เสมอ
 * (StakeholderRaciEntry[] = {raci, name}) ไม่ว่าเอกสารต้นทางจะเก็บมาในรูปแบบไหนก็ตาม:
 *   1) raciAssignments (รูปแบบจริงปัจจุบันของระบบสรรหา) — ใช้ก่อนเสมอถ้ามีข้อมูล
 *   2) stakeholders เป็น array ของ {raci, name} อยู่แล้ว (ฝั่ง Data เคยบันทึกเอง)
 *   3) stakeholders เป็น string คั่นคอมมา อาจมีวงเล็บกำกับ RACI ต่อท้ายแต่ละชื่อ
 *   4) stakeholders เป็น array ของชื่อเฉยๆ ไม่มีบทบาทกำกับ -> ใช้ raci เดิมของทั้งแถวกับทุกคน
 * ไม่ทำลายข้อมูลเดิม แค่แปะบทบาทให้ครบ ค่อยแก้ให้ถูกทีละคนทีหลังได้
 */
export const migrateResponsibilityStakeholders = (row: ResponsibilityRow): StakeholderRaciEntry[] => {
  if (Array.isArray(row.raciAssignments) && row.raciAssignments.length > 0) {
    return row.raciAssignments
      .filter((a) => (a.stakeholder || "").toString().trim())
      .map((a) => ({ raci: ((a.raci as string) || "I").toUpperCase(), name: (a.stakeholder || "").toString().trim() }));
  }

  const raw = row.stakeholders;
  if (!raw) return [];

  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
    return raw as StakeholderRaciEntry[];
  }

  const legacyRaci = ((row.raci as string) || "I").toUpperCase();

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const m = part.match(/^(.*?)\s*\(([RACIraci])\)\s*$/);
        return m ? { raci: m[2].toUpperCase(), name: m[1].trim() } : { raci: legacyRaci, name: part };
      });
  }

  if (Array.isArray(raw)) {
    return (raw as string[]).filter(Boolean).map((name) => ({ raci: legacyRaci, name }));
  }

  return [];
};

/** แปลงกลับเป็นรูปแบบที่ระบบสรรหาใช้จริง (raciAssignments: {stakeholder, raci}[]) ตอนบันทึกจากฟอร์มนี้
 * เพื่อให้ field ชื่อตรงกับฝั่งสรรหาเป๊ะ ไม่สร้าง field คู่ขนานชื่อใหม่ (stakeholders) ที่ไม่มีใครอ่านอีกฝั่งหนึ่ง */
export const toRaciAssignments = (entries: StakeholderRaciEntry[]): RaciAssignmentRaw[] =>
  entries
    .filter((e) => (e.name || "").trim())
    .map((e) => ({ stakeholder: e.name.trim(), raci: e.raci }));

/** สีของ chip ตามตัวอักษรบทบาท */
export const RACI_CHIP_CLASS: Record<string, string> = {
  R: "bg-sky-100 text-sky-700",
  A: "bg-purple-100 text-purple-700",
  C: "bg-yellow-100 text-yellow-800",
  I: "bg-gray-200 text-gray-700",
};

/** ลำดับการแสดงผล/export เรียงตาม R → A → C → I เสมอ ตรงกับตัวอย่างที่ระบบสรรหาส่งมา */
const RACI_ORDER: Record<string, number> = { R: 0, A: 1, C: 2, I: 3 };

export const sortStakeholderEntries = (entries: StakeholderRaciEntry[]): StakeholderRaciEntry[] =>
  [...entries].sort((a, b) => (RACI_ORDER[a.raci] ?? 9) - (RACI_ORDER[b.raci] ?? 9));

/** รูปแบบข้อความสำหรับ export Excel คอลัมน์ "บทบาท (RACI)" เช่น "R ผู้ช่วยสำรวจ · A วิศวกรสำรวจ · C วิศวกรหน้างาน · I หัวหน้าควบคุมงาน" */
export const formatStakeholdersForExport = (entries: StakeholderRaciEntry[]): string =>
  sortStakeholderEntries(entries)
    .map((e) => `${e.raci} ${e.name}`)
    .join(" · ");

export const SKILL_CATEGORY_OPTIONS = [
  "Hard Skills\n(ทักษะวิชาชีพ)",
  "Soft Skills\n(ทักษะการทำงานร่วมกัน)",
] as const;

export interface SkillMatrixRow {
  category?: string;
  skill?: string;
  expectedLevel?: number;
  actualLevel?: number;
  idpMethod?: string;
  // true แปลว่า AI ช่วยร่างให้ ยังไม่ผ่านการยืนยันจาก HR 100% — ต้องแสดงป้ายเตือนเสมอถ้าโชว์ต่อ
  aiSuggested?: boolean;
}

export const SKILL_LEVEL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Level 1 - Basic" },
  { value: 2, label: "Level 2 - Intermediate" },
  { value: 3, label: "Level 3 - Advanced" },
  { value: 4, label: "Level 4 - Expert" },
];

export interface LinkedContract {
  type?: "probation" | "fixed" | "supply" | string;
  status?: "issued" | "signed" | string;
  startDate?: string;
  endDate?: string;
  signedAttachmentUrl?: string;
}

export interface JobDescription {
  id: string; // = packet:{hiringPacketId} หรือ employee:{รหัสพนักงาน}

  // ข้อมูลตำแหน่ง
  jobTitle?: string;
  jobTitleNormalized?: string;
  jobCode?: string;
  department?: string;
  jobLevel?: string;
  reportsTo?: string;
  preparedDate?: string;
  jobPurpose?: string;
  scopeNote?: string;

  // หน้าที่ + Job Matrix (RACI)
  responsibilities?: ResponsibilityRow[];

  // คุณสมบัติผู้ดำรงตำแหน่ง
  education?: string;
  experience?: string;
  knowledgeSkills?: string;
  additionalQualifications?: string;

  // Skill Matrix
  skillMatrix?: SkillMatrixRow[];

  // ผู้ลงนาม
  employeeName?: string;
  preparerName?: string;
  approverName?: string;
  acknowledgerName?: string;

  // ข้อมูลผู้สมัคร/พนักงาน ณ ตอนซิงค์ (เฉพาะฝั่งสรรหา)
  candidateName?: string;
  position?: string;
  existingEmployeeId?: string;

  // สัญญาจ้าง
  linkedContracts?: LinkedContract[];

  // สถานะ: draft = ร่าง, issued = ยืนยันใช้งานจริงแล้ว
  status?: "draft" | "issued" | string;
  issuedAt?: unknown;
  issuedByName?: string;

  // ที่มา / join key
  hiringPacketId?: string | null;
  employeeCode?: string;
  source?: JobDescriptionSource;
  ownerKey?: string;

  // audit — ฝั่งสรรหา
  syncedAt?: unknown;
  syncedByName?: string;

  // audit — ฝั่ง Data (เพิ่มทุกครั้งที่ทีม Data กดบันทึกจากฟอร์มนี้ ไม่ว่าจะแก้เอกสารจากแหล่งไหนก็ตาม
  // ไม่แตะ/เปลี่ยน source เดิม เพื่อให้รู้ที่มาแรกเริ่มเสมอ)
  updatedAt?: unknown;
  updatedByName?: string;
  updatedByUid?: string;
  dataTeamEditedAt?: unknown;
  dataTeamEditedByName?: string;
  dataTeamEditedByUid?: string;

  [key: string]: unknown;
}

/** doc id ของเอกสาร JD ที่ฝั่ง Data สร้าง/แก้เอง (พนักงานเก่าที่ไม่ได้มาจากระบบสรรหา) */
export const buildEmployeeJobDescriptionDocId = (employeeCode: string): string => `employee:${employeeCode}`;

/** ใช้เช็คว่า doc id นี้เป็นเอกสารที่ฝั่งสรรหาสงวนไว้หรือไม่ (ห้าม client ฝั่ง Data สร้างใหม่ด้วย prefix นี้) */
export const isRecruitmentOwnedDocId = (docId: string): boolean => docId.startsWith("packet:");

/**
 * key ที่ใช้ query หาเอกสาร JD ที่มาจากระบบสรรหาของพนักงานคนหนึ่ง — employee_data.recruitmentSourceId
 * ที่เขียนตอน import จากหน้า "รายชื่อรอเพิ่มจาก Recruitment" มีค่าเท่ากับ hiringPacketId อยู่แล้ว
 * (ดูคอมเมนต์ใน RecruitmentIntakePage.tsx) จึง join ตรงได้เลยโดยไม่ต้องเปิด recruitment_pending_employees
 */
export const resolveEmployeeHiringPacketId = (employee: {
  recruitmentSourceId?: string;
  hiringPacketId?: string;
}): string | undefined => employee.recruitmentSourceId || employee.hiringPacketId || undefined;

/**
 * normalize ชื่อตำแหน่งไว้เทียบ JD ตำแหน่งเดิมข้ามฝั่งกันได้ (lowercase + ตัดวงเล็บ/เครื่องหมาย +
 * รวมช่องว่าง + trim) — ต้องเหมือนกับ normalizeJobTitle() ฝั่งระบบสรรหาเป๊ะๆ ไม่งั้นเทียบไม่ตรงกัน
 * TODO: รอ sync ฟังก์ชันจริงจาก src/lib/jobDescriptionModel.js ของระบบสรรหามาแทนที่ชั่วคราวนี้
 */
export const normalizeJobTitle = (title: string): string =>
  (title || "")
    .toLowerCase()
    .replace(/[()[\]{}.,/\\\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * รายการ stakeholder เดียวกับที่ระบบสรรหาใช้ (src/lib/jobDescriptionModel.js → STAKEHOLDER_GROUPS)
 * ได้รับ JSON มายืนยันแล้ว 2026-11-09 — ต้องเก็บค่าตรงนี้ให้ตรงกับฝั่งสรรหาเป๊ะทุกตัวอักษร
 * ไม่งั้นรายงานที่รวมข้อมูลสองฝั่งจะ match กันไม่ได้
 */
export const STAKEHOLDER_GROUPS: { group: string; options: string[] }[] = [
  {
    group: "ฝ่ายบริหารโครงการและงานวิศวกรรมหน้างาน (Site Operation & Engineering)",
    options: [
      "Project Director (PD) / ผู้อำนวยการโครงการ",
      "Project Manager (PM) / ผู้จัดการโครงการ",
      "Construction Manager (CM) / ผู้จัดการฝ่ายก่อสร้าง",
      "Site Engineer - Civil/Structural / วิศวกรโยธา-โครงสร้าง",
      "Site Engineer - Architectural / วิศวกร-สถาปนิกหน้างาน",
      "Site Engineer - MEP / วิศวกรงานระบบ (ไฟฟ้า-ประปา-ปรับอากาศ)",
      "Foreman / โฟร์แมน (หัวหน้าคนงาน)",
      "Surveyor / ช่างสำรวจ",
      "Storekeeper / เจ้าหน้าที่สโตร์หน้างาน",
      "Site Admin / ธุรการสนาม",
    ],
  },
  {
    group: "ฝ่ายสนับสนุนวิศวกรรมและควบคุมคุณภาพ (Engineering Support, QA/QC & Safety)",
    options: [
      "QA/QC Manager / ผู้จัดการฝ่ายประกันและควบคุมคุณภาพ",
      "QC Engineer / วิศวกรควบคุมคุณภาพ",
      "HSE / Safety Officer / จป.วิชาชีพ-เทคนิค",
      "Planning & Scheduling Engineer / วิศวกรวางแผน",
      "Cost Control Engineer / วิศวกรควบคุมต้นทุน",
      "Quantity Surveyor (QS) / วิศวกรประเมินราคาและถอดแบบ",
      "Estimator / วิศวกรประเมินราคา (ฝ่ายประมูล)",
      "BIM / CAD Draftsman / ช่างเขียนแบบ",
      "Document Control (DC) / เจ้าหน้าที่ควบคุมเอกสาร",
    ],
  },
  {
    group: "ฝ่ายสนับสนุนสำนักงานใหญ่ (Head Office Support Functions)",
    options: [
      "HR Recruiter / เจ้าหน้าที่สรรหาบุคลากร",
      "Alien Labor Officer / เจ้าหน้าที่ดูแลแรงงานต่างด้าว",
      "HR Generalist / Payroll / เจ้าหน้าที่บุคคลและค่าจ้าง",
      "Procurement / Purchasing Officer / เจ้าหน้าที่จัดซื้อ",
      "Accounting & Finance / ฝ่ายบัญชีและการเงิน",
      "Machinery & Fleet / ฝ่ายเครื่องจักรกลและยานพาหนะ",
      "IT Support / เจ้าหน้าที่เทคโนโลยีสารสนเทศ",
      "Legal & Contract / ฝ่ายกฎหมายและสัญญา",
      "ISO / QMR / ตัวแทนฝ่ายบริหารระบบคุณภาพ",
    ],
  },
  {
    group: "หน่วยงานและบุคคลภายนอกบริษัท (External Stakeholders)",
    options: [
      "Owner / Client / เจ้าของโครงการ-ลูกค้า",
      "Consultant / CSC / PMCM / ที่ปรึกษาควบคุมงาน",
      "Designer / ผู้ออกแบบ (สถาปนิก/วิศวกรผู้ออกแบบ)",
      "Subcontractor / ผู้รับเหมาช่วง",
      "Supplier / Vendor / ผู้จำหน่ายวัสดุและเครื่องจักร",
      "Third-Party Lab / ห้องปฏิบัติการทดสอบอิสระ",
      "Government Agencies / หน่วยงานราชการ",
    ],
  },
];

/** รายชื่อ stakeholder แบบแบน (ไม่แยกหมวด) ไว้ทำ autocomplete/datalist ตอนเพิ่มคู่บทบาท+ชื่อ
 * — ยังพิมพ์เองนอกลิสต์นี้ได้เสมอ (ไม่ใช่ select แบบบังคับเลือก) */
export const STAKEHOLDER_OPTIONS: string[] = STAKEHOLDER_GROUPS.flatMap((g) => g.options);
