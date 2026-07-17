import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import type { EmployeeFollowUpCase, FollowUpActionType, FollowUpDocumentRecord } from "../components/employeeFollowUpConfig";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;

const TEMPLATE_URLS = {
  warning_memo: asset("/templates/follow-up/fm-hr-017-warning-memo.pdf"),
  warning_letter: asset("/templates/follow-up/fm-hr-018-warning-letter.pdf"),
  termination_notice: asset("/templates/follow-up/termination-notice.pdf"),
} as const;

const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const FONT_BOLD_URL = asset("/fonts/sarabun-thai-600-normal.woff");

export type FollowUpTemplateKey = keyof typeof TEMPLATE_URLS;

export const FOLLOW_UP_TEMPLATE_LABELS: Record<FollowUpTemplateKey, string> = {
  warning_memo: "FM-HR-017 บันทึกข้อความขอออกหนังสือตักเตือน",
  warning_letter: "FM-HR-018 หนังสือเตือน",
  termination_notice: "หนังสือแจ้งพ้นสภาพการเป็นพนักงาน",
};

interface SignerInfo {
  uid: string;
  name: string;
  signatureImageUrl?: string;
}

export interface FollowUpDocumentInput {
  followUpCase: EmployeeFollowUpCase;
  actionType: FollowUpActionType;
  note?: string;
  suspensionStartDate?: string;
  suspensionEndDate?: string;
  suspensionTotalDays?: number;
  terminationDate?: string;
  incidentDate?: string;
  incidentTime?: string;
  warningRound?: number;
  preparer: SignerInfo;
  approver?: SignerInfo;
}

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status}): ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

const fontCache = new Map<string, Uint8Array>();
const loadFontBytes = async (url: string): Promise<Uint8Array> => {
  if (!fontCache.has(url)) fontCache.set(url, await fetchBytes(url));
  return fontCache.get(url)!;
};

const thaiDateParts = (isoDate?: string): { day: string; month: string; year: string } => {
  if (!isoDate) return { day: "", month: "", year: "" };
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "", month: "", year: "" };
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return {
    day: String(date.getDate()),
    month: monthNames[date.getMonth()],
    year: String(date.getFullYear() + 543),
  };
};

interface FieldSpec {
  x: number;
  y: number;
  maxWidth: number;
  size?: number;
}

/** วาดข้อความให้พอดีกับความกว้างที่กำหนด (ลดขนาดฟอนต์ลงหากยาวเกิน) โดยวางไว้เหนือเส้นประของฟอร์มเดิมเล็กน้อย */
const drawFitted = (page: PDFPage, font: PDFFont, text: string, spec: FieldSpec, baseSize = 10) => {
  const value = (text || "").trim();
  if (!value) return;
  let size = spec.size || baseSize;
  const minSize = 6.5;
  while (size > minSize && font.widthOfTextAtSize(value, size) > spec.maxWidth) {
    size -= 0.5;
  }
  page.drawText(value, { x: spec.x, y: spec.y + 2, size, font, color: rgb(0.05, 0.05, 0.15) });
};

const drawMark = (page: PDFPage, font: PDFFont, spec: { x: number; y: number }) => {
  page.drawText("X", { x: spec.x, y: spec.y, size: 10, font, color: rgb(0.75, 0, 0) });
};

const embedSignature = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  signer: SignerInfo | undefined,
  box: { x: number; y: number; maxWidth: number; maxHeight: number }
) => {
  if (!signer?.signatureImageUrl) return;
  try {
    const bytes = await fetchBytes(signer.signatureImageUrl);
    const isPng = signer.signatureImageUrl.toLowerCase().includes(".png");
    const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    const scale = Math.min(box.maxWidth / image.width, box.maxHeight / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: box.x + (box.maxWidth - w) / 2, y: box.y, width: w, height: h });
  } catch {
    // เซ็นสดตามปกติ หากฝังลายเซ็นดิจิทัลไม่สำเร็จ (เช่นรูปโหลดไม่ได้)
  }
};

// พิกัดอ้างอิงจากการดึงตำแหน่งข้อความจริงในไฟล์ต้นฉบับ (origin ล่างซ้าย, หน่วย pt, ขนาดหน้า A4)
const WARNING_MEMO_FIELDS = {
  date: { x: 458, y: 681.5, maxWidth: 90 } as FieldSpec,
  employeeName: { x: 232, y: 586.3, maxWidth: 150 } as FieldSpec,
  position: { x: 429, y: 586.3, maxWidth: 115 } as FieldSpec,
  department: { x: 150, y: 562.9, maxWidth: 190 } as FieldSpec,
  incidentDate: { x: 200, y: 539.6, maxWidth: 42 } as FieldSpec,
  incidentTime: { x: 310, y: 539.6, maxWidth: 65 } as FieldSpec,
  descriptionLine1: { x: 428, y: 539.6, maxWidth: 115 } as FieldSpec,
  descriptionLine2: { x: 57, y: 516.2, maxWidth: 490 } as FieldSpec,
  descriptionLine3: { x: 57, y: 493.0, maxWidth: 490 } as FieldSpec,
  approverName: { x: 372, y: 204.4, maxWidth: 150 } as FieldSpec,
};

const WARNING_LETTER_FIELDS = {
  day: { x: 335, y: 675.4, maxWidth: 25 } as FieldSpec,
  month: { x: 395, y: 675.4, maxWidth: 55 } as FieldSpec,
  year: { x: 465, y: 675.4, maxWidth: 55 } as FieldSpec,
  employeeName: { x: 220, y: 636.5, maxWidth: 185 } as FieldSpec,
  incidentDate: { x: 234, y: 583.4, maxWidth: 135 } as FieldSpec,
  incidentTime: { x: 242, y: 564.0, maxWidth: 105 } as FieldSpec,
  factsLine1: { x: 98, y: 525.1, maxWidth: 440 } as FieldSpec,
  factsLine2: { x: 98, y: 505.7, maxWidth: 440 } as FieldSpec,
  verbalCheckbox: { x: 108, y: 386 },
  verbalRound: { x: 276, y: 384.3, maxWidth: 40 } as FieldSpec,
  writtenCheckbox: { x: 340, y: 386 },
  writtenRound: { x: 502, y: 384.3, maxWidth: 40 } as FieldSpec,
  suspensionCheckbox: { x: 108, y: 347.5 },
  suspensionFrom: { x: 200, y: 326.1, maxWidth: 130 } as FieldSpec,
  suspensionTo: { x: 400, y: 326.1, maxWidth: 130 } as FieldSpec,
  suspensionTotalDays: { x: 220, y: 306.7, maxWidth: 60 } as FieldSpec,
  terminationCheckbox: { x: 108, y: 289.3 },
  terminationDate: { x: 408, y: 287.3, maxWidth: 90 } as FieldSpec,
  approverName: { x: 388, y: 190.7, maxWidth: 155 } as FieldSpec,
  approverSignatureBox: { x: 386, y: 195, maxWidth: 160, maxHeight: 32 },
};

const TERMINATION_FIELDS = {
  docDate: { x: 456, y: 645.5, maxWidth: 83 } as FieldSpec,
  employeeName: { x: 94, y: 626.1, maxWidth: 160 } as FieldSpec,
  employeeName2: { x: 58, y: 517.1, maxWidth: 340 } as FieldSpec,
  position: { x: 256, y: 517.1, maxWidth: 250 } as FieldSpec,
  startDate: { x: 58, y: 491.7, maxWidth: 175 } as FieldSpec,
  lastWorkDate: { x: 146, y: 466.2, maxWidth: 240 } as FieldSpec,
  absentSinceDate: { x: 144, y: 440.8, maxWidth: 350 } as FieldSpec,
  employeeNameForTermination: { x: 281, y: 321.7, maxWidth: 225 } as FieldSpec,
  effectiveDate: { x: 381, y: 296.2, maxWidth: 145 } as FieldSpec,
  hrmApproverSignatureBox: { x: 312, y: 195, maxWidth: 150, maxHeight: 32 },
};

const downloadBlob = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const loadPdfWithFonts = async (
  templateKey: FollowUpTemplateKey
): Promise<{ pdfDoc: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont }> => {
  const [templateBytes, regularBytes, boldBytes] = await Promise.all([
    fetchBytes(TEMPLATE_URLS[templateKey]),
    loadFontBytes(FONT_REGULAR_URL),
    loadFontBytes(FONT_BOLD_URL),
  ]);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit as any);
  const regular = await pdfDoc.embedFont(regularBytes, { subset: true });
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
  const page = pdfDoc.getPages()[0];
  return { pdfDoc, page, regular, bold };
};

export const generateWarningMemoPdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular } = await loadPdfWithFonts("warning_memo");
  const f = WARNING_MEMO_FIELDS;
  const c = input.followUpCase;
  const nowParts = thaiDateParts(new Date().toISOString().slice(0, 10));

  drawFitted(page, regular, `${nowParts.day} ${nowParts.month} ${nowParts.year}`, f.date);
  drawFitted(page, regular, c.employeeName, f.employeeName);
  drawFitted(page, regular, c.position || "-", f.position);
  drawFitted(page, regular, c.projectName || "-", f.department);
  if (input.incidentDate) {
    const parts = thaiDateParts(input.incidentDate);
    drawFitted(page, regular, `${parts.day}/${parts.month}`, f.incidentDate, 8);
  }
  if (input.incidentTime) drawFitted(page, regular, input.incidentTime, f.incidentTime, 8);
  const description = input.note || c.issueReason || c.issueLabel;
  drawFitted(page, regular, description.slice(0, 55), f.descriptionLine1, 9);
  drawFitted(page, regular, description.slice(55, 155), f.descriptionLine2, 9);
  drawFitted(page, regular, description.slice(155, 255), f.descriptionLine3, 9);
  drawFitted(page, regular, input.approver?.name || "", f.approverName);

  return pdfDoc.save();
};

export const generateWarningLetterPdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular } = await loadPdfWithFonts("warning_letter");
  const f = WARNING_LETTER_FIELDS;
  const c = input.followUpCase;
  const today = thaiDateParts(new Date().toISOString().slice(0, 10));

  drawFitted(page, regular, today.day, f.day, 9);
  drawFitted(page, regular, today.month, f.month, 9);
  drawFitted(page, regular, today.year, f.year, 9);
  drawFitted(page, regular, c.employeeName, f.employeeName);
  if (input.incidentDate) {
    const parts = thaiDateParts(input.incidentDate);
    drawFitted(page, regular, `${parts.day} ${parts.month} ${parts.year}`, f.incidentDate, 9);
  }
  if (input.incidentTime) drawFitted(page, regular, input.incidentTime, f.incidentTime, 9);
  const facts = input.note || c.issueReason || c.issueLabel;
  drawFitted(page, regular, facts.slice(0, 70), f.factsLine1, 9);
  drawFitted(page, regular, facts.slice(70, 160), f.factsLine2, 9);

  const isVerbal = input.actionType === "verbal_warning";
  const isWritten = input.actionType.startsWith("written_warning");
  const isSuspension = input.actionType.startsWith("suspension_");
  const isTermination = input.actionType === "termination";

  if (isVerbal) {
    drawMark(page, regular, f.verbalCheckbox);
    if (input.warningRound) drawFitted(page, regular, String(input.warningRound), f.verbalRound, 9);
  }
  if (isWritten) {
    drawMark(page, regular, f.writtenCheckbox);
    if (input.warningRound) drawFitted(page, regular, String(input.warningRound), f.writtenRound, 9);
  }
  if (isSuspension) {
    drawMark(page, regular, f.suspensionCheckbox);
    if (input.suspensionStartDate) {
      const p = thaiDateParts(input.suspensionStartDate);
      drawFitted(page, regular, `${p.day}/${p.month}/${p.year}`, f.suspensionFrom, 9);
    }
    if (input.suspensionEndDate) {
      const p = thaiDateParts(input.suspensionEndDate);
      drawFitted(page, regular, `${p.day}/${p.month}/${p.year}`, f.suspensionTo, 9);
    }
    if (input.suspensionTotalDays) drawFitted(page, regular, String(input.suspensionTotalDays), f.suspensionTotalDays, 9);
  }
  if (isTermination) {
    drawMark(page, regular, f.terminationCheckbox);
    if (input.terminationDate) {
      const p = thaiDateParts(input.terminationDate);
      drawFitted(page, regular, `${p.day}/${p.month}/${p.year}`, f.terminationDate, 9);
    }
  }

  drawFitted(page, regular, input.approver ? `(${input.approver.name})` : "", f.approverName, 9);
  await embedSignature(pdfDoc, page, input.approver, f.approverSignatureBox);

  return pdfDoc.save();
};

export const generateTerminationNoticePdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular } = await loadPdfWithFonts("termination_notice");
  const f = TERMINATION_FIELDS;
  const c = input.followUpCase;
  const today = thaiDateParts(new Date().toISOString().slice(0, 10));

  drawFitted(page, regular, `${today.day} ${today.month} ${today.year}`, f.docDate, 9);
  drawFitted(page, regular, c.employeeName, f.employeeName);
  drawFitted(page, regular, c.employeeName, f.employeeName2);
  drawFitted(page, regular, c.position || "-", f.position);
  if (input.incidentDate) {
    const startParts = thaiDateParts(input.incidentDate);
    drawFitted(page, regular, `${startParts.day} ${startParts.month} ${startParts.year}`, f.absentSinceDate, 9);
  }
  drawFitted(page, regular, c.employeeName, f.employeeNameForTermination);
  if (input.terminationDate) {
    const p = thaiDateParts(input.terminationDate);
    drawFitted(page, regular, `${p.day} ${p.month} ${p.year}`, f.effectiveDate, 9);
  }
  await embedSignature(pdfDoc, page, input.approver, f.hrmApproverSignatureBox);

  return pdfDoc.save();
};

/** เลือกฟอร์มที่เหมาะสมตามประเภทการดำเนินการ + ประเภทประเด็น ตามที่ระบุในแผน */
export const resolveFollowUpTemplateKeys = (
  actionType: FollowUpActionType,
  issueType: string
): FollowUpTemplateKey[] => {
  if (actionType === "termination") {
    if (issueType === "consecutive_absence" || issueType === "total_absence") {
      return ["termination_notice"];
    }
    return ["warning_letter"];
  }
  if (actionType === "verbal_warning") return ["warning_letter"];
  if (actionType.startsWith("written_warning")) return ["warning_memo", "warning_letter"];
  if (actionType.startsWith("suspension_")) return ["warning_letter"];
  return ["warning_letter"];
};

const GENERATORS: Record<FollowUpTemplateKey, (input: FollowUpDocumentInput) => Promise<Uint8Array>> = {
  warning_memo: generateWarningMemoPdf,
  warning_letter: generateWarningLetterPdf,
  termination_notice: generateTerminationNoticePdf,
};

export const generateAndDownloadFollowUpDocument = async (
  templateKey: FollowUpTemplateKey,
  input: FollowUpDocumentInput
): Promise<FollowUpDocumentRecord> => {
  const bytes = await GENERATORS[templateKey](input);
  const filename = `${FOLLOW_UP_TEMPLATE_LABELS[templateKey]} - ${input.followUpCase.employeeName}.pdf`;
  downloadBlob(bytes, filename);
  return {
    id: `${input.followUpCase.id}-${templateKey}-${Date.now()}`,
    templateKey,
    templateLabel: FOLLOW_UP_TEMPLATE_LABELS[templateKey],
    generatedAt: Date.now(),
    generatedByUid: input.preparer.uid,
    generatedByName: input.preparer.name,
    usedSignatureOfUid: input.approver?.uid,
    usedSignatureOfName: input.approver?.name,
  };
};
