import JSZip from "jszip";
import type { TrainingEnrollment } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

const escapeXml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const generateDrugTestReportDocx = async (
  project: string, session: string, date: string, people: TrainingEnrollment[], employees: EmployeeRow[]
): Promise<Uint8Array> => {
  if (!session.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !people.length) throw new Error("กรุณาระบุครั้งตรวจ วันที่ตรวจ และเลือกรายชื่ออย่างน้อย 1 คน");
  const response = await fetch(`${process.env.PUBLIC_URL || ""}/templates/training/cmg-drug-test-report.docx`);
  if (!response.ok) throw new Error("โหลดแบบฟอร์มตรวจสารเสพติดไม่สำเร็จ");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("แบบฟอร์มตรวจสารเสพติดไม่สมบูรณ์");
  let xml = await file.async("text");
  const templateRow = (xml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || []).find((row) => row.includes("{{NO}}"));
  if (!templateRow) throw new Error("ไม่พบแถวรายชื่อในแบบฟอร์ม");
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const [year, month, day] = date.split("-");
  const displayDate = `${day}/${month}/${Number(year) + 543}`;
  const rows = people.map((person, index) => {
    const employee = employeeById.get(person.employeeId);
    const nameEnglish = `${employee?.ชื่ออังกฤษ || ""} ${employee?.นามสกุลอังกฤษ || ""}`.trim();
    const values: Record<string, string> = {
      NO: String(index + 1), NAME: nameEnglish || person.employeeName,
      POSITION: person.matrixRole || person.position || "", COMPANY: "CMG", DATE: displayDate,
    };
    return templateRow.replace(/\{\{(\w+)\}\}/g, (_match, field: string) => escapeXml(values[field] || ""));
  }).join("");
  xml = xml.replace(templateRow, () => rows).replace(/\{\{PROJECT\}\}/g, () => escapeXml(project))
    .replace(/\{\{SESSION\}\}/g, () => escapeXml(session.trim())).replace(/\{\{DATE\}\}/g, displayDate);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
};

export const downloadDrugTestReportDocx = async (
  project: string, session: string, date: string, people: TrainingEnrollment[], employees: EmployeeRow[]
): Promise<void> => {
  const bytes = await generateDrugTestReportDocx(project, session, date, people, employees);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Drug_Test_${session.trim().replace(/[\\/:*?"<>|]/g, "_")}_${date}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
