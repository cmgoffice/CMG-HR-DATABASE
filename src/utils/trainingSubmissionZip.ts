import JSZip from "jszip";
import { getApplicableRequirements, groupRequirements } from "../components/projectDocumentConfig";
import type { ProjectDocumentRequirement } from "../components/projectDocumentConfig";
import { isMigrantNationality } from "../components/trainingBatchConfig";
import type { TrainingEnrollment, HealthCheckRecord } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

export const generateTrainingSubmissionZip = async (
  forms: Array<{ name: string; bytes: Uint8Array }>,
  enrollments: TrainingEnrollment[], employees: EmployeeRow[],
  requirements: ProjectDocumentRequirement[], healthRecords: Map<string, HealthCheckRecord>, warnings: string[] = []
): Promise<Uint8Array> => {
  if (!enrollments.length) throw new Error("กรุณาเพิ่มรายชื่อผู้เข้าอบรมก่อนดาวน์โหลด");
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").replace(/^[. ]+|[. ]+$/g, "") || "document";
  const missing: string[] = [];
  const documents: Array<{ path: string; url: string; label: string }> = [];
  enrollments.forEach((enrollment, personIndex) => {
    const employee = employeeById.get(enrollment.employeeId);
    if (!employee) {
      missing.push(`${enrollment.employeeName} — ไม่พบข้อมูลพนักงาน`);
      return;
    }
    const attachments = employee.attachments || [];
    const applicable = getApplicableRequirements(requirements, isMigrantNationality(employee.สัญชาติ || enrollment.nationality))
      .filter((requirement) => requirement.fulfillmentType !== "generated_by_system");
    const units = groupRequirements(applicable).sort((a, b) =>
      Math.min(...a.options.map((requirement) => applicable.indexOf(requirement))) - Math.min(...b.options.map((requirement) => applicable.indexOf(requirement))));
    const folder = `02_เอกสารแนบ/${String(personIndex + 1).padStart(2, "0")}_${safeName(enrollment.employeeName)}_${safeName(enrollment.employeeId)}`;
    if (!requirements.length) {
      attachments.forEach((attachment, index) => {
        if (attachment.url) documents.push({ path: `${folder}/${String(index + 1).padStart(2, "0")}_${safeName(attachment.name || "document.pdf")}`, url: attachment.url, label: enrollment.employeeName });
      });
      const health = healthRecords.get(enrollment.employeeId);
      if (health?.fileUrl && !attachments.some((attachment) => attachment.url === health.fileUrl)) documents.push({ path: `${folder}/ใบรับรองแพทย์_${safeName(health.fileName || "medical.pdf")}`, url: health.fileUrl, label: enrollment.employeeName });
      if (!attachments.some((attachment) => attachment.url) && !health?.fileUrl) missing.push(`${enrollment.employeeName} — ยังไม่มีเอกสารแนบ`);
    }
    units.forEach((unit, index) => {
      let attachment = attachments.find((item) => item.url && unit.options.some((option) => option.docType === item.docType));
      const health = healthRecords.get(enrollment.employeeId);
      if (!attachment && health?.fileUrl && unit.options.some((option) => /health_cert|medical|รับรองแพทย์/i.test(`${option.docType} ${option.label}`))) attachment = { url: health.fileUrl, name: health.fileName || "medical.pdf" };
      if (!attachment?.url) {
        missing.push(`${enrollment.employeeName} — ${unit.label}`);
        return;
      }
      documents.push({ path: `${folder}/${String(index + 1).padStart(2, "0")}_${safeName(attachment.name || `${unit.label}.pdf`)}`, url: attachment.url, label: `${enrollment.employeeName} — ${unit.label}` });
    });
  });
  warnings.push(...missing);
  const zip = new JSZip();
  forms.forEach((form) => zip.file(form.name, form.bytes));
  const cache = new Map<string, ArrayBuffer>();
  for (const document of documents) {
    let bytes = cache.get(document.url);
    if (!bytes) {
      const response = await fetch(document.url);
      if (!response.ok) throw new Error(`ดาวน์โหลดเอกสารไม่สำเร็จ: ${document.label}`);
      bytes = await response.arrayBuffer();
      cache.set(document.url, bytes);
    }
    zip.file(document.path, bytes);
  }
  if (warnings.length) zip.file("รายการเอกสารที่ต้องติดตาม.txt", `\uFEFFชุดนี้รวมเฉพาะเอกสารที่มี กรุณาติดตามรายการต่อไปนี้\n\n${Array.from(new Set(warnings)).join("\n")}`);
  return zip.generateAsync({ type: "uint8array" });
};
