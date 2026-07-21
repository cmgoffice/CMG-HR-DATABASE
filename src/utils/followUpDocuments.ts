import { PDFDocument, PDFFont, PDFPage, PageSizes, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import sarabunLatinRegularUrl from "@fontsource/sarabun/files/sarabun-latin-400-normal.woff";
import sarabunLatinBoldUrl from "@fontsource/sarabun/files/sarabun-latin-600-normal.woff";
import type { EmployeeFollowUpCase, FollowUpActionType, FollowUpDocumentRecord } from "../components/employeeFollowUpConfig";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;

const LOGO_URL = asset("/templates/follow-up/cmg-logo.jpg");

const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const FONT_BOLD_URL = asset("/fonts/sarabun-thai-600-normal.woff");
const FONT_LATIN_REGULAR_URL = sarabunLatinRegularUrl;
const FONT_LATIN_BOLD_URL = sarabunLatinBoldUrl;

export type FollowUpTemplateKey = "warning_memo" | "warning_letter" | "termination_notice";

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
  violatedRule?: string;
  suspensionStartDate?: string;
  suspensionEndDate?: string;
  suspensionTotalDays?: number;
  terminationDate?: string;
  incidentDate?: string;
  incidentTime?: string;
  employmentStartDate?: string;
  lastWorkDate?: string;
  absenceStartDate?: string;
  warningRound?: number;
  preparer: SignerInfo;
  approver?: SignerInfo;
  isDraft?: boolean;
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

const thaiDateText = (isoDate?: string): string => {
  const p = thaiDateParts(isoDate);
  if (!p.day) return "-";
  return `${p.day} ${p.month} ${p.year}`;
};

interface PdfFontSet {
  thai: PDFFont;
  latin: PDFFont;
}

const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN_X = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TEXT_COLOR = rgb(0.05, 0.05, 0.15);
const LINE_COLOR = rgb(0.15, 0.15, 0.2);
const MARK_COLOR = rgb(0.75, 0, 0);

const fontForCharacter = (fonts: PdfFontSet, character: string): PDFFont =>
  /[\u0E00-\u0E7F]/.test(character) ? fonts.thai : fonts.latin;

const textWidth = (fonts: PdfFontSet, text: string, size: number): number =>
  Array.from(text).reduce(
    (width, character) => width + fontForCharacter(fonts, character).widthOfTextAtSize(character, size),
    0
  );

const drawTextWithFallback = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; y: number; size: number }
) => {
  let x = options.x;
  let run = "";
  let runFont: PDFFont | undefined;

  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, {
      x,
      y: options.y,
      size: options.size,
      font: runFont,
      color: TEXT_COLOR,
    });
    x += runFont.widthOfTextAtSize(run, options.size);
    run = "";
  };

  for (const character of Array.from(text)) {
    const characterFont = fontForCharacter(fonts, character);
    if (runFont && characterFont !== runFont) flush();
    runFont = characterFont;
    run += character;
  }
  flush();
};

/** ตัดคำแบบ greedy โดยยึดช่องว่างเป็นหลัก และตัดเป็นรายตัวอักษรหากคำ/ช่วงข้อความยาวเกินความกว้างที่กำหนด (เช่น ข้อความไทยที่ไม่มีช่องว่าง) */
const wrapText = (fonts: PdfFontSet, text: string, maxWidth: number, size: number): string[] => {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  const breakLongWord = (word: string) => {
    let remaining = word;
    while (remaining && textWidth(fonts, remaining, size) > maxWidth) {
      let cut = remaining.length;
      while (cut > 1 && textWidth(fonts, remaining.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    return remaining;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(fonts, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (textWidth(fonts, word, size) > maxWidth) {
      current = breakLongWord(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

/** วาดข้อความหลายบรรทัดแบบตัดคำอัตโนมัติ คืนค่า y ถัดจากบรรทัดสุดท้ายเพื่อให้วางเนื้อหาต่อได้ */
const drawParagraph = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; y: number; maxWidth: number; size?: number; lineHeight?: number; maxLines?: number }
): number => {
  const size = options.size ?? 10;
  const lineHeight = options.lineHeight ?? size * 1.6;
  const lines = wrapText(fonts, text, options.maxWidth, size);
  const limited = options.maxLines ? lines.slice(0, options.maxLines) : lines;
  let y = options.y;
  limited.forEach((line) => {
    drawTextWithFallback(page, fonts, line, { x: options.x, y, size });
    y -= lineHeight;
  });
  return limited.length > 0 ? y + lineHeight - lineHeight : y;
};

/** วาด label ตามด้วยค่า หรือเส้นใต้ว่างไว้ให้กรอก (ยาวไปจนถึง lineEndX) บนบรรทัดเดียวกัน */
const drawLabelLine = (
  page: PDFPage,
  fonts: PdfFontSet,
  options: {
    label?: string;
    value?: string;
    x: number;
    y: number;
    lineEndX: number;
    size?: number;
    gap?: number;
    boldLabel?: PdfFontSet;
  }
) => {
  const size = options.size ?? 10;
  const gap = options.gap ?? 4;
  let valueX = options.x;
  if (options.label) {
    const labelFont = options.boldLabel || fonts;
    drawTextWithFallback(page, labelFont, options.label, { x: options.x, y: options.y, size });
    valueX = options.x + textWidth(labelFont, options.label, size) + gap;
  }
  const value = (options.value || "").trim();
  if (value) {
    drawTextWithFallback(page, fonts, value, { x: valueX, y: options.y, size });
  } else if (options.lineEndX > valueX) {
    page.drawLine({
      start: { x: valueX, y: options.y - 2 },
      end: { x: options.lineEndX, y: options.y - 2 },
      thickness: 0.7,
      color: LINE_COLOR,
    });
  }
};

const drawCheckbox = (page: PDFPage, options: { x: number; y: number; size?: number; checked?: boolean }) => {
  const size = options.size ?? 9;
  page.drawRectangle({
    x: options.x,
    y: options.y,
    width: size,
    height: size,
    borderColor: LINE_COLOR,
    borderWidth: 0.8,
  });
  if (options.checked) {
    page.drawText("X", {
      x: options.x + size * 0.15,
      y: options.y + size * 0.12,
      size: size * 0.95,
      color: MARK_COLOR,
    });
  }
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

/** วาดบรรทัด "ลงชื่อ...." พร้อมชื่อในวงเล็บและตำแหน่งด้านล่าง ฝังลายเซ็นดิจิทัลไว้เหนือเส้นหากมี */
const drawSignatureBlock = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: PdfFontSet,
  options: { x: number; y: number; width: number; label?: string; name?: string; signer?: SignerInfo }
) => {
  const signLabel = "ลงชื่อ";
  drawTextWithFallback(page, fonts, signLabel, { x: options.x, y: options.y, size: 10 });
  const dotsStartX = options.x + textWidth(fonts, signLabel, 10) + 4;
  page.drawLine({
    start: { x: dotsStartX, y: options.y - 1 },
    end: { x: options.x + options.width, y: options.y - 1 },
    thickness: 0.7,
    color: LINE_COLOR,
  });
  if (options.signer?.signatureImageUrl) {
    await embedSignature(pdfDoc, page, options.signer, {
      x: dotsStartX,
      y: options.y + 3,
      maxWidth: Math.max(0, options.x + options.width - dotsStartX),
      maxHeight: 30,
    });
  }
  const nameValue = options.name ?? options.signer?.name ?? "";
  const nameText = `( ${nameValue} )`;
  const nameWidth = textWidth(fonts, nameText, 10);
  drawTextWithFallback(page, fonts, nameText, { x: options.x + (options.width - nameWidth) / 2, y: options.y - 16, size: 10 });
  if (options.label) {
    const labelWidth = textWidth(fonts, options.label, 9);
    drawTextWithFallback(page, fonts, options.label, { x: options.x + (options.width - labelWidth) / 2, y: options.y - 30, size: 9 });
  }
};

/** วาดหัวกระดาษบริษัท (โลโก้ + ชื่อ/ที่อยู่/เลขผู้เสียภาษี) แล้วคืนค่า y ถัดไปสำหรับวางเนื้อหา */
const drawCompanyHeader = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  fonts: PdfFontSet,
  bold: PdfFontSet,
  options: { includeEnglish?: boolean; includeTaxId?: boolean }
): Promise<number> => {
  const topY = PAGE_HEIGHT - MARGIN_X;
  let logoBottomY = topY;
  try {
    const logoBytes = await fetchBytes(LOGO_URL);
    const logo = await pdfDoc.embedJpg(logoBytes);
    const logoWidth = 78;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    page.drawImage(logo, { x: MARGIN_X, y: topY - logoHeight, width: logoWidth, height: logoHeight });
    logoBottomY = topY - logoHeight;
  } catch {
    // ไม่พบไฟล์โลโก้ ให้แสดงเฉพาะข้อความหัวกระดาษ
  }

  const textX = MARGIN_X + 92;
  let textY = topY - 10;
  drawTextWithFallback(page, bold, "บริษัท ซีเอ็มจี เอ็นจิเนียริ่ง แอนด์ คอนสตรัคชั่น จำกัด", { x: textX, y: textY, size: 12 });
  textY -= 15;
  if (options.includeEnglish) {
    drawTextWithFallback(page, fonts, "CMG ENGINEERING & CONSTRUCTION CO., LTD.", { x: textX, y: textY, size: 9 });
    textY -= 13;
  }
  drawTextWithFallback(page, fonts, "4/281 หมู่ 3 ตำบลเนินพระ อำเภอเมืองระยอง จังหวัดระยอง 21000 โทร./แฟกซ์: 033-680588", {
    x: textX,
    y: textY,
    size: 8.5,
  });
  textY -= 12;
  if (options.includeTaxId) {
    drawTextWithFallback(page, fonts, "เลขประจำตัวผู้เสียภาษี 0215557001784", { x: textX, y: textY, size: 8.5 });
    textY -= 12;
  }

  const ruleY = Math.min(logoBottomY, textY) - 12;
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ruleY },
    thickness: 1,
    color: LINE_COLOR,
  });
  return ruleY - 22;
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

const openPdfInNewTab = (bytes: Uint8Array) => {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (!opened) {
    // Popup blocked - fall back to a direct download so the user can still view the file.
    const link = document.createElement("a");
    link.href = url;
    link.download = "preview.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

const loadPdfWithFonts = async (): Promise<{
  pdfDoc: PDFDocument;
  page: PDFPage;
  regular: PdfFontSet;
  bold: PdfFontSet;
}> => {
  const [regularBytes, boldBytes, latinRegularBytes, latinBoldBytes] = await Promise.all([
    loadFontBytes(FONT_REGULAR_URL),
    loadFontBytes(FONT_BOLD_URL),
    loadFontBytes(FONT_LATIN_REGULAR_URL),
    loadFontBytes(FONT_LATIN_BOLD_URL),
  ]);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit as any);
  const regular = {
    thai: await pdfDoc.embedFont(regularBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinRegularBytes, { subset: true }),
  };
  const bold = {
    thai: await pdfDoc.embedFont(boldBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinBoldBytes, { subset: true }),
  };
  const page = pdfDoc.addPage(PageSizes.A4);
  return { pdfDoc, page, regular, bold };
};

export const generateWarningMemoPdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular, bold } = await loadPdfWithFonts();
  const c = input.followUpCase;

  let y = await drawCompanyHeader(pdfDoc, page, regular, bold, { includeEnglish: true, includeTaxId: true });

  drawTextWithFallback(page, regular, "FM-HR-017/00", { x: MARGIN_X, y, size: 9 });
  y -= 20;
  const title = "บันทึกข้อความ";
  const titleWidth = textWidth(bold, title, 16);
  drawTextWithFallback(page, bold, title, { x: (PAGE_WIDTH - titleWidth) / 2, y, size: 16 });
  y -= 26;

  drawLabelLine(page, regular, {
    label: "วันที่",
    value: thaiDateText(new Date().toISOString().slice(0, 10)),
    x: PAGE_WIDTH - MARGIN_X - 170,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
  });
  y -= 24;

  drawLabelLine(page, regular, { label: "เรื่อง", value: "ขอออกหนังสือตักเตือน", x: MARGIN_X, y, lineEndX: PAGE_WIDTH - MARGIN_X });
  y -= 20;
  drawLabelLine(page, regular, { label: "เรียน", value: "ฝ่ายบุคคล", x: MARGIN_X, y, lineEndX: PAGE_WIDTH - MARGIN_X });
  y -= 26;

  const opening = `เนื่องจาก นาย/นาง/นางสาว ${c.employeeName} ตำแหน่ง ${c.position || "-"} สังกัดหน่วยงาน ${c.projectName || "-"} ได้กระทำการฝ่าฝืนกฎระเบียบข้อบังคับของบริษัท`;
  y = drawParagraph(page, regular, opening, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10.5, lineHeight: 17 });
  y -= 6;

  const incidentLine = `กล่าวคือ เมื่อวันที่ ${thaiDateText(input.incidentDate)} เวลาประมาณ ${input.incidentTime || "-"} น. ท่านได้กระทำดังนี้`;
  y = drawParagraph(page, regular, incidentLine, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10.5, lineHeight: 17 });
  y -= 4;

  const description = [input.note || c.issueReason || c.issueLabel, input.violatedRule ? `ระเบียบที่เกี่ยวข้อง: ${input.violatedRule}` : ""]
    .filter(Boolean)
    .join(" ");
  y = drawParagraph(page, regular, description, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10.5, lineHeight: 17, maxLines: 5 });
  y -= 10;

  y = drawParagraph(page, regular, "ซึ่งเป็นการกระทำความผิดระเบียบข้อบังคับการทำงานของบริษัท จึงเรียนมาเพื่อโปรดพิจารณา", {
    x: MARGIN_X,
    y,
    maxWidth: CONTENT_WIDTH,
    size: 10.5,
    lineHeight: 17,
  });
  y -= 40;

  await drawSignatureBlock(pdfDoc, page, regular, {
    x: PAGE_WIDTH - MARGIN_X - 200,
    y,
    width: 200,
    label: "ผู้มีอำนาจ",
    name: input.approver?.name,
    signer: input.approver,
  });

  return pdfDoc.save();
};

export const generateWarningLetterPdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular, bold } = await loadPdfWithFonts();
  const c = input.followUpCase;

  let y = await drawCompanyHeader(pdfDoc, page, regular, bold, { includeEnglish: true, includeTaxId: true });

  drawTextWithFallback(page, regular, "FM-HR-018", { x: MARGIN_X, y, size: 9 });
  y -= 18;
  const title = "หนังสือเตือน";
  const titleWidth = textWidth(bold, title, 15);
  drawTextWithFallback(page, bold, title, { x: (PAGE_WIDTH - titleWidth) / 2, y, size: 15 });
  y -= 22;

  drawLabelLine(page, regular, {
    label: "วันที่",
    value: thaiDateText(new Date().toISOString().slice(0, 10)),
    x: PAGE_WIDTH - MARGIN_X - 190,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9.5,
  });
  y -= 18;

  drawLabelLine(page, regular, {
    label: "เรื่อง",
    value: "การฝ่าฝืนคำสั่ง ระเบียบ หรือข้อบังคับเกี่ยวกับการทำงาน",
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9.5,
  });
  y -= 16;
  drawLabelLine(page, regular, {
    label: "เรียน",
    value: `นาย/นาง/นางสาว ${c.employeeName}`,
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9.5,
  });
  y -= 22;

  drawTextWithFallback(page, bold, "บันทึกการสอบสวน / Disciplinary Hearing", { x: MARGIN_X, y, size: 9.5 });
  y -= 16;
  y = drawParagraph(
    page,
    regular,
    "การกระทำของท่านดังกล่าว เป็นการฝ่าฝืนระเบียบข้อบังคับการทำงาน / Your violation subject to Company Rule & Regulation :",
    { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 9, lineHeight: 13 }
  );
  const facts = input.note || c.issueReason || c.issueLabel || "-";
  y = drawParagraph(page, regular, facts, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 9, lineHeight: 13, maxLines: 3 });
  y -= 10;

  drawTextWithFallback(page, bold, "บริษัทจึงขอลงโทษทางวินัยแก่ท่านโดย / You are therefore subjected to the following :-", {
    x: MARGIN_X,
    y,
    size: 9.5,
  });
  y -= 18;

  const isVerbal = input.actionType === "verbal_warning";
  const isWritten = input.actionType.startsWith("written_warning");
  const isSuspension = input.actionType.startsWith("suspension_");
  const isTermination = input.actionType === "termination";

  drawCheckbox(page, { x: MARGIN_X, y: y - 7, checked: isVerbal });
  drawLabelLine(page, regular, {
    label: "ตักเตือนด้วยวาจา / Verbal Warning ครั้งที่",
    value: isVerbal && input.warningRound ? String(input.warningRound) : "",
    x: MARGIN_X + 15,
    y,
    lineEndX: MARGIN_X + 260,
    size: 9,
  });
  drawCheckbox(page, { x: MARGIN_X + 275, y: y - 7, checked: isWritten });
  drawLabelLine(page, regular, {
    label: "ตักเตือนเป็นหนังสือ / Written Warning ครั้งที่",
    value: isWritten && input.warningRound ? String(input.warningRound) : "",
    x: MARGIN_X + 290,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 20;

  drawCheckbox(page, { x: MARGIN_X, y: y - 7, checked: false });
  drawLabelLine(page, regular, {
    label: "ตัดเงินเดือน / ตัดค่าจ้าง / ตัดสิทธิประโยชน์อื่นๆ / Wage / Benefit Cut off",
    x: MARGIN_X + 15,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 20;

  drawCheckbox(page, { x: MARGIN_X, y: y - 7, checked: isSuspension });
  drawTextWithFallback(page, regular, "พักงานโดยไม่จ่ายค่าจ้าง / Suspension without payment", { x: MARGIN_X + 15, y, size: 9 });
  y -= 17;
  drawLabelLine(page, regular, {
    label: "ตั้งแต่ / From",
    value: input.suspensionStartDate ? thaiDateText(input.suspensionStartDate) : "",
    x: MARGIN_X + 30,
    y,
    lineEndX: MARGIN_X + 280,
    size: 9,
  });
  drawLabelLine(page, regular, {
    label: "ถึง / To",
    value: input.suspensionEndDate ? thaiDateText(input.suspensionEndDate) : "",
    x: MARGIN_X + 300,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 17;
  drawLabelLine(page, regular, {
    label: "รวมเป็นเวลา / Total",
    value: input.suspensionTotalDays ? `${input.suspensionTotalDays} วัน` : "",
    x: MARGIN_X + 30,
    y,
    lineEndX: MARGIN_X + 250,
    size: 9,
  });
  y -= 20;

  drawCheckbox(page, { x: MARGIN_X, y: y - 7, checked: isTermination });
  drawLabelLine(page, regular, {
    label: "เลิกจ้าง / ให้ออกจากงาน / ไล่ออกจากงาน ตั้งแต่ / Termination from วันที่",
    value: input.terminationDate ? thaiDateText(input.terminationDate) : "",
    x: MARGIN_X + 15,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 24;

  y = drawParagraph(
    page,
    regular,
    "ดังนั้น จึงให้ท่านแก้ไข ปรับปรุง งดเว้น หรือละเว้นการกระทำเช่นว่านั้น บริษัทขอเตือนว่า หากท่านยังคงกระทำผิดซ้ำคำเตือนอีก ท่านอาจถูกพิจารณาลงโทษหนักขึ้น หรืออาจถึงขั้นเลิกจ้างโดยไม่จ่ายค่าชดเชยต่อไป จึงเรียนมาเพื่อทราบ",
    { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 9, lineHeight: 13 }
  );
  y -= 4;
  y = drawParagraph(
    page,
    regular,
    "หมายเหตุ : พนักงานไม่ได้ลงนามรับทราบหนังสือเตือน บริษัทจึงอ่านให้พนักงานฟังต่อหน้าพยาน หรือได้ส่งหนังสือโดยไปรษณีย์ หรือได้ปิดประกาศหนังสือให้ทราบแล้ว",
    { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 8.5, lineHeight: 12 }
  );
  y -= 26;

  const halfWidth = (CONTENT_WIDTH - 20) / 2;
  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: halfWidth,
    label: "ผู้มีอำนาจลงนาม",
    name: input.approver?.name,
    signer: input.approver,
  });
  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X + halfWidth + 20,
    y,
    width: halfWidth,
    label: "ได้ทราบหนังสือเตือนแล้ว",
  });
  y -= 46;

  drawLabelLine(page, regular, {
    label: "วันที่กระทำผิด / Date of Violation :",
    value: input.incidentDate ? thaiDateText(input.incidentDate) : "",
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 16;
  drawLabelLine(page, regular, {
    label: "เวลาที่กระทำผิด / Time of Violation :",
    value: input.incidentTime || "",
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9,
  });
  y -= 18;

  drawTextWithFallback(page, regular, "ลักษณะการกระทำผิด / Facts of the case :", { x: MARGIN_X, y, size: 9 });
  y -= 14;
  y = drawParagraph(page, regular, input.violatedRule || facts, {
    x: MARGIN_X,
    y,
    maxWidth: CONTENT_WIDTH,
    size: 9,
    lineHeight: 13,
    maxLines: 2,
  });
  y -= 20;

  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: 260,
    label: "ผู้อ่าน/ผู้ส่งหนังสือ/ผู้ปิดประกาศ",
  });
  y -= 46;
  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: 260,
    label: "พยาน",
  });

  return pdfDoc.save();
};

const HR_MANAGER_NAME = "นางสาวสรยา พินิจผล";

export const generateTerminationNoticePdf = async (input: FollowUpDocumentInput): Promise<Uint8Array> => {
  const { pdfDoc, page, regular, bold } = await loadPdfWithFonts();
  const c = input.followUpCase;

  let y = await drawCompanyHeader(pdfDoc, page, regular, bold, { includeEnglish: false, includeTaxId: false });

  const title = "หนังสือแจ้งพ้นสภาพการเป็นพนักงาน";
  const titleWidth = textWidth(bold, title, 15);
  drawTextWithFallback(page, bold, title, { x: (PAGE_WIDTH - titleWidth) / 2, y, size: 15 });
  y -= 24;

  drawLabelLine(page, regular, { label: "เลขที่", value: "", x: MARGIN_X, y, lineEndX: MARGIN_X + 130, size: 9.5 });
  drawLabelLine(page, regular, {
    label: "วันที่",
    value: thaiDateText(new Date().toISOString().slice(0, 10)),
    x: PAGE_WIDTH - MARGIN_X - 190,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 9.5,
  });
  y -= 18;
  drawTextWithFallback(page, regular, "เขียนที่ บริษัท ซีเอ็มจี เอ็นจิเนียริ่ง แอนด์ คอนสตรัคชั่น จำกัด", { x: MARGIN_X, y, size: 9.5 });
  y -= 22;

  drawLabelLine(page, regular, { label: "เรียน", value: `คุณ ${c.employeeName}`, x: MARGIN_X, y, lineEndX: PAGE_WIDTH - MARGIN_X, size: 10 });
  y -= 18;
  drawLabelLine(page, regular, {
    label: "เรื่อง",
    value: "การพ้นสภาพการเป็นพนักงาน",
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 10,
  });
  y -= 18;
  drawLabelLine(page, regular, {
    label: "อ้างถึง",
    value: "ระเบียบข้อบังคับการทำงาน",
    x: MARGIN_X,
    y,
    lineEndX: PAGE_WIDTH - MARGIN_X,
    size: 10,
  });
  y -= 24;

  const paragraph1 = `ตามที่บริษัท ซีเอ็มจี เอ็นจิเนียริ่ง แอนด์ คอนสตรัคชั่น จำกัด ได้ทำการว่าจ้างคุณ ${c.employeeName} เข้าทำงานในตำแหน่ง ${c.position || "-"} ตั้งแต่วันที่ ${thaiDateText(input.employmentStartDate)} เป็นต้นมา จนถึงวันสุดท้ายที่พบว่าพนักงานมาทำงานในวันที่ ${thaiDateText(input.lastWorkDate)} นั้น`;
  y = drawParagraph(page, regular, paragraph1, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10, lineHeight: 16 });
  y -= 8;

  const paragraph2 = `แต่ปรากฏว่า ตั้งแต่วันที่ ${thaiDateText(input.absenceStartDate || input.incidentDate)} ซึ่งเป็นระยะเวลา 3 วันทำงานติดต่อกันขึ้นไป ที่พนักงานมิได้มาปฏิบัติงานที่บริษัทฯ โดยมิได้แจ้งหรือชี้แจงเหตุผลในการหยุดงานให้ทางบริษัทฯ ทราบแต่อย่างใด ถือได้ว่าพนักงานมีเจตนาละทิ้งหน้าที่ติดต่อกันเป็นเวลา 3 วันทำงานขึ้นไป โดยไม่มีเหตุอันควร ทำให้บริษัทฯ ได้รับความเสียหาย เป็นความผิดตามกฎหมายแรงงาน และข้อบังคับในการทำงานของบริษัทฯ หมวด วินัย การลงโทษ และการร้องทุกข์ ข้อที่ 12 ห้ามละทิ้งหน้าที่ หรือขาดงาน`;
  y = drawParagraph(page, regular, paragraph2, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10, lineHeight: 16 });
  y -= 8;

  const paragraph3 = `ดังนั้น โดยหนังสือฉบับนี้ บริษัทฯ ได้พิจารณาแล้ว จึงขอเลิกจ้างคุณ ${c.employeeName} โดยไม่จ่ายเงินค่าชดเชยใดๆ ตามกฎหมาย และให้พนักงานพ้นสภาพการเป็นพนักงาน นับตั้งแต่วันที่ ${thaiDateText(input.terminationDate)} เป็นต้นไป`;
  y = drawParagraph(page, regular, paragraph3, { x: MARGIN_X, y, maxWidth: CONTENT_WIDTH, size: 10, lineHeight: 16 });
  y -= 8;

  drawTextWithFallback(page, regular, "จึงแจ้งมาเพื่อทราบ", { x: MARGIN_X, y, size: 10 });
  y -= 40;

  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: 240,
    label: "ฝ่ายบุคคลรับทราบ",
    name: HR_MANAGER_NAME,
  });
  y -= 50;
  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: 240,
    label: "ผู้จัดการโครงการ",
    name: input.approver?.name,
    signer: input.approver,
  });
  y -= 50;
  await drawSignatureBlock(pdfDoc, page, regular, {
    x: MARGIN_X,
    y,
    width: 240,
    label: "พนักงานเซ็นรับทราบ",
  });

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
  const filename = `${FOLLOW_UP_TEMPLATE_LABELS[templateKey]}${input.isDraft ? " - ร่างตรวจสอบ" : ""} - ${input.followUpCase.employeeName}.pdf`;
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
    actionType: input.actionType,
  };
};

/** Opens the document in a new browser tab so the user can view it before deciding to download it. */
export const generateAndPreviewFollowUpDocument = async (
  templateKey: FollowUpTemplateKey,
  input: FollowUpDocumentInput
): Promise<void> => {
  const bytes = await GENERATORS[templateKey](input);
  openPdfInNewTab(bytes);
};
