import JSZip from "jszip";
import type { TrainingBatch, TrainingEnrollment } from "../components/trainingBatchConfig";
import type { EmployeeRow } from "../components/TrainingBatchPage";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ROWS_PER_SHEET = 21;
const setText = (xml: string, address: string, value: string): string => xml.replace(
  new RegExp(`<c r="${address}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`),
  (_match, attrs: string) => `<c r="${address}"${attrs.replace(/\s+t="[^"]*"/g, "")} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
);

export const generateCardReceiptFormXlsx = async (batch: TrainingBatch, people: TrainingEnrollment[], employees: EmployeeRow[]): Promise<Uint8Array> => {
  if (!people.length) throw new Error("กรุณาเพิ่มรายชื่อผู้เข้าอบรมก่อนดาวน์โหลดใบลงชื่อรับบัตร");
  const response = await fetch(`${process.env.PUBLIC_URL || ""}/templates/training/j74-card-receipt-form.xlsx`);
  if (!response.ok) throw new Error("โหลดแบบฟอร์มใบลงชื่อรับบัตรไม่สำเร็จ");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const template = await zip.file("xl/worksheets/sheet1.xml")!.async("text");
  const sheetRels = await zip.file("xl/worksheets/_rels/sheet1.xml.rels")?.async("text");
  let workbook = await zip.file("xl/workbook.xml")!.async("text");
  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("text");
  let contentTypes = await zip.file("[Content_Types].xml")!.async("text");
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const pages = Math.ceil(people.length / ROWS_PER_SHEET);
  for (let page = 0; page < pages; page += 1) {
    let sheet = setText(template, "A1", `แบบฟอร์มใบลงชื่อรับบัตรพนักงาน CMG (J74) อบรม ${batch.date || ""}${pages > 1 ? ` — ชุดที่ ${page + 1}` : ""}`);
    sheet = sheet.replace(/<pageSetup\b([^>]*?)\/>/, (_match, attrs: string) =>
      `<pageSetup${attrs.replace(/\s+(?:scale|fitToWidth|fitToHeight)="[^"]*"/g, "")} fitToWidth="1" fitToHeight="1"/>`);
    for (let index = 0; index < ROWS_PER_SHEET; index += 1) {
      const person = people[page * ROWS_PER_SHEET + index];
      const employee = person && employeeById.get(person.employeeId);
      const nameEnglish = `${employee?.ชื่ออังกฤษ || ""} ${employee?.นามสกุลอังกฤษ || ""}`.trim();
      const values: Record<string, string> = person ? {
        A: String(page * ROWS_PER_SHEET + index + 1), B: nameEnglish, C: person.employeeName,
        D: person.matrixRole || person.position || "", E: "CMG", F: "",
        G: person.accessBadgeReceived?.cardNumber || "", H: "", I: "", J: "",
      } : { A: "", B: "", C: "", D: "", E: "", F: "", G: "", H: "", I: "", J: "" };
      Object.keys(values).forEach((column) => { sheet = setText(sheet, `${column}${index + 4}`, values[column]); });
    }
    const sheetNumber = page + 1;
    if (page > 0) sheet = sheet.replace(/tabSelected="1"/g, 'tabSelected="0"');
    zip.file(`xl/worksheets/sheet${sheetNumber}.xml`, sheet);
    if (page > 0) {
      const id = `rIdReceipt${sheetNumber}`;
      workbook = workbook.replace("</sheets>", `<sheet name="Form${sheetNumber}" sheetId="${sheetNumber}" r:id="${id}"/></sheets>`);
      workbook = workbook.replace("</definedNames>", `<definedName name="_xlnm.Print_Area" localSheetId="${page}">Form${sheetNumber}!$A$1:$J$24</definedName><definedName name="_xlnm.Print_Titles" localSheetId="${page}">Form${sheetNumber}!$1:$3</definedName></definedNames>`);
      rels = rels.replace("</Relationships>", `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/></Relationships>`);
      contentTypes = contentTypes.replace("</Types>", `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
      if (sheetRels) zip.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`, sheetRels);
    }
  }
  zip.file("xl/workbook.xml", workbook);
  zip.file("xl/_rels/workbook.xml.rels", rels);
  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "uint8array" });
};

export const downloadCardReceiptFormXlsx = async (batch: TrainingBatch, people: TrainingEnrollment[], employees: EmployeeRow[]): Promise<void> => {
  const bytes = await generateCardReceiptFormXlsx(batch, people, employees);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `J74_ใบลงชื่อรับบัตร_${batch.date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
