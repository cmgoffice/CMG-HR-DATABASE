// ---------------------------------------------------------------------------
// สร้างไฟล์ PDF "ประกาศภายในบริษัท" จากข้อมูล AnnouncementRecord
// ใช้แนวทางเดียวกับ src/utils/followUpDocuments.ts (pdf-lib + ฟอนต์สารบัญไทย) แต่ตัดให้เบาลง
// และรองรับเนื้อหาหลายหน้า/ตารางประกอบ เพราะประกาศมักยาวกว่าฟอร์ม follow-up
// ---------------------------------------------------------------------------

import { PDFDocument, PDFFont, PDFPage, PageSizes, rgb } from "pdf-lib";
// @ts-ignore - @pdf-lib/fontkit has no bundled types matching this pdf-lib version
import fontkit from "@pdf-lib/fontkit";
import sarabunLatinRegularUrl from "@fontsource/sarabun/files/sarabun-latin-400-normal.woff";
import sarabunLatinBoldUrl from "@fontsource/sarabun/files/sarabun-latin-600-normal.woff";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import type { AnnouncementRecord } from "../components/announcementConfig";

const asset = (path: string): string => `${process.env.PUBLIC_URL || ""}${path}`;
const LOGO_URL = asset("/templates/follow-up/cmg-logo-white.jpg");
const FONT_REGULAR_URL = asset("/fonts/sarabun-thai-400-normal.woff");
const FONT_BOLD_URL = asset("/fonts/sarabun-thai-600-normal.woff");

interface PdfFontSet {
  thai: PDFFont;
  latin: PDFFont;
}

const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN_X = 50;
const MARGIN_TOP = PAGE_HEIGHT - 50;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const TEXT_COLOR = rgb(0.05, 0.05, 0.15);
const LINE_COLOR = rgb(0.15, 0.15, 0.2);

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

const fontForCharacter = (fonts: PdfFontSet, character: string): PDFFont =>
  /[\u0E00-\u0E7F]/.test(character) ? fonts.thai : fonts.latin;

const textWidth = (fonts: PdfFontSet, text: string, size: number): number =>
  Array.from(text).reduce((w, c) => w + fontForCharacter(fonts, c).widthOfTextAtSize(c, size), 0);

const drawText = (
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  options: { x: number; y: number; size: number; color?: ReturnType<typeof rgb> }
) => {
  let x = options.x;
  let run = "";
  let runFont: PDFFont | undefined;
  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, { x, y: options.y, size: options.size, font: runFont, color: options.color || TEXT_COLOR });
    x += runFont.widthOfTextAtSize(run, options.size);
    run = "";
  };
  for (const character of Array.from(text)) {
    const cf = fontForCharacter(fonts, character);
    if (runFont && cf !== runFont) flush();
    runFont = cf;
    run += character;
  }
  flush();
};

const wrapText = (fonts: PdfFontSet, text: string, maxWidth: number, size: number): string[] => {
  const normalized = (text || "").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [""];
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
    current = textWidth(fonts, word, size) > maxWidth ? breakLongWord(word) : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

interface Cursor {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: PdfFontSet;
  bold: PdfFontSet;
  y: number;
  pageIndex: number;
}

const newPage = (cursor: Cursor) => {
  cursor.page = cursor.pdfDoc.addPage(PageSizes.A4);
  cursor.pageIndex += 1;
  cursor.y = MARGIN_TOP;
};

const ensureSpace = (cursor: Cursor, neededHeight: number) => {
  if (cursor.y - neededHeight < MARGIN_BOTTOM) newPage(cursor);
};

/** วาดย่อหน้าแบบตัดคำอัตโนมัติ ขึ้นหน้าใหม่ให้เองเมื่อเนื้อหาล้นหน้า */
const drawParagraph = (
  cursor: Cursor,
  text: string,
  options: { size?: number; bold?: boolean; align?: "left" | "center"; indent?: number; gapAfter?: number }
) => {
  const size = options.size ?? 11;
  const lineHeight = size * 1.7;
  const fonts = options.bold ? cursor.bold : cursor.fonts;
  const indent = options.indent ?? 0;
  const lines = wrapText(fonts, text, CONTENT_WIDTH - indent, size);
  lines.forEach((line, i) => {
    ensureSpace(cursor, lineHeight);
    const lineIndent = i === 0 ? indent : 0;
    let x = MARGIN_X + lineIndent;
    if (options.align === "center") {
      const w = textWidth(fonts, line, size);
      x = MARGIN_X + (CONTENT_WIDTH - w) / 2;
    }
    drawText(cursor.page, fonts, line, { x, y: cursor.y, size });
    cursor.y -= lineHeight;
  });
  cursor.y -= options.gapAfter ?? 4;
};

const drawTable = (cursor: Cursor, headers: string[], rows: string[][]) => {
  if (!headers.length) return;
  const colWidth = CONTENT_WIDTH / headers.length;
  const size = 9.5;
  const padY = 6;

  const rowHeight = (cells: string[]): number => {
    let maxLines = 1;
    cells.forEach((cell, i) => {
      const lines = wrapText(cursor.fonts, cell, colWidth - 10, size).length;
      if (lines > maxLines) maxLines = lines;
    });
    return maxLines * (size * 1.5) + padY * 2;
  };

  const drawRow = (cells: string[], bold: boolean) => {
    const h = rowHeight(cells);
    ensureSpace(cursor, h);
    const topY = cursor.y;
    cells.forEach((cell, i) => {
      const x = MARGIN_X + i * colWidth;
      page_drawRect(cursor.page, x, topY - h, colWidth, h);
      const fonts = bold ? cursor.bold : cursor.fonts;
      const lines = wrapText(fonts, cell, colWidth - 10, size);
      let ly = topY - padY - size;
      lines.forEach((line) => {
        drawText(cursor.page, fonts, line, { x: x + 5, y: ly, size });
        ly -= size * 1.5;
      });
    });
    cursor.y = topY - h;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row, false));
  cursor.y -= 10;
};

const page_drawRect = (page: PDFPage, x: number, y: number, w: number, h: number) => {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE_COLOR, borderWidth: 0.6 });
};

const thaiDateParts = (isoDate?: string): { day: string; month: string; year: string } => {
  const date = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return { day: "", month: "", year: "" };
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return { day: String(date.getDate()), month: monthNames[date.getMonth()], year: String(date.getFullYear() + 543) };
};

const thaiDateText = (isoDate?: string): string => {
  const p = thaiDateParts(isoDate);
  return p.day ? `${p.day} ${p.month} ${p.year}` : "-";
};

/** วาดหัวกระดาษบริษัท (โลโก้ + ชื่อ/ที่อยู่) พร้อมเลขที่เอกสาร/วันที่มุมขวาบน คืนค่า y ถัดไปสำหรับวางเนื้อหา */
const drawHeader = async (cursor: Cursor, documentNumber: string | undefined, isDraft: boolean) => {
  const topY = MARGIN_TOP;
  let logoBottomY = topY;
  try {
    const logoBytes = await fetchBytes(LOGO_URL);
    const logo = await cursor.pdfDoc.embedJpg(logoBytes);
    const logoWidth = 78;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    cursor.page.drawImage(logo, { x: MARGIN_X, y: topY - logoHeight, width: logoWidth, height: logoHeight });
    logoBottomY = topY - logoHeight;
  } catch {
    // ไม่พบโลโก้ — ข้ามไป แสดงเฉพาะข้อความหัวกระดาษ
  }

  const headerRight = documentNumber ? `เลขที่ ${documentNumber}` : "(ร่าง - จะออกเลขที่เมื่อออกประกาศจริง)";
  const rightWidth = textWidth(cursor.fonts, headerRight, 9);
  drawText(cursor.page, cursor.fonts, headerRight, { x: PAGE_WIDTH - MARGIN_X - rightWidth, y: topY, size: 9 });
  const dateLine = `วันที่ออกประกาศ ${thaiDateText()}`;
  const dateWidth = textWidth(cursor.fonts, dateLine, 9);
  drawText(cursor.page, cursor.fonts, dateLine, { x: PAGE_WIDTH - MARGIN_X - dateWidth, y: topY - 13, size: 9 });

  const textX = MARGIN_X + 92;
  let textY = topY - 10;
  drawText(cursor.page, cursor.bold, "บริษัท ซีเอ็มจี เอ็นจิเนียริ่ง แอนด์ คอนสตรัคชั่น จำกัด", { x: textX, y: textY, size: 12 });
  textY -= 15;
  drawText(cursor.page, cursor.fonts, "4/281 หมู่ 3 ตำบลเนินพระ อำเภอเมืองระยอง จังหวัดระยอง 21000 โทร./แฟกซ์: 033-680588", {
    x: textX,
    y: textY,
    size: 8.5,
  });
  textY -= 13;

  cursor.y = Math.min(logoBottomY, textY) - 20;
};

export const generateAnnouncementPdf = async (
  record: AnnouncementRecord,
  options: { documentNumber?: string; isDraft?: boolean } = {}
): Promise<Uint8Array> => {
  const [regularBytes, boldBytes, latinRegularBytes, latinBoldBytes] = await Promise.all([
    loadFontBytes(FONT_REGULAR_URL),
    loadFontBytes(FONT_BOLD_URL),
    loadFontBytes(sarabunLatinRegularUrl),
    loadFontBytes(sarabunLatinBoldUrl),
  ]);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit as any);
  const fonts: PdfFontSet = {
    thai: await pdfDoc.embedFont(regularBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinRegularBytes, { subset: true }),
  };
  const bold: PdfFontSet = {
    thai: await pdfDoc.embedFont(boldBytes, { subset: true }),
    latin: await pdfDoc.embedFont(latinBoldBytes, { subset: true }),
  };
  const page = pdfDoc.addPage(PageSizes.A4);
  const cursor: Cursor = { pdfDoc, page, fonts, bold, y: MARGIN_TOP, pageIndex: 0 };

  await drawHeader(cursor, options.documentNumber, !!options.isDraft);

  drawParagraph(cursor, record.title, { size: 14, bold: true, align: "center", gapAfter: 16 });
  if (record.salutation) drawParagraph(cursor, record.salutation, { size: 11, gapAfter: 10 });

  record.bodyParagraphs.filter((p) => p.trim()).forEach((p) => {
    drawParagraph(cursor, p, { size: 11, indent: 24, gapAfter: 8 });
  });

  if (record.table && record.table.headers.length) {
    cursor.y -= 6;
    drawTable(cursor, record.table.headers, record.table.rows.map((r) => r.cells));
  }

  if (record.closingNote?.trim()) {
    drawParagraph(cursor, record.closingNote, { size: 11, gapAfter: 10 });
  }

  // บรรทัด "จึงประกาศให้ทราบโดยทั่วกัน" + บล็อกลงนาม
  drawParagraph(cursor, "จึงประกาศให้ทราบโดยทั่วกัน", { size: 11, align: "center", gapAfter: 50 });

  ensureSpace(cursor, 90);
  const signX = PAGE_WIDTH - MARGIN_X - 220;
  drawParagraph(cursor, record.effectiveDate ? `ประกาศ ณ วันที่ ${thaiDateText(record.effectiveDate)}` : "", {
    size: 10,
    align: "center",
    gapAfter: 30,
  });
  const nameText = `( ${record.signerName || "..............................."} )`;
  const nameWidth = textWidth(cursor.fonts, nameText, 10);
  drawText(cursor.page, cursor.fonts, nameText, { x: signX + (220 - nameWidth) / 2, y: cursor.y, size: 10 });
  cursor.y -= 15;
  if (record.signerTitle) {
    const titleWidth = textWidth(cursor.fonts, record.signerTitle, 10);
    drawText(cursor.page, cursor.fonts, record.signerTitle, { x: signX + (220 - titleWidth) / 2, y: cursor.y, size: 10 });
    cursor.y -= 13;
  }
  const companyText = "บริษัท ซีเอ็มจี เอ็นจิเนียริ่ง แอนด์ คอนสตรัคชั่น จำกัด";
  const companyWidth = textWidth(cursor.fonts, companyText, 10);
  drawText(cursor.page, cursor.fonts, companyText, { x: signX + (220 - companyWidth) / 2, y: cursor.y, size: 10 });

  return pdfDoc.save();
};

const downloadBlob = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const openPdfInNewTab = (bytes: Uint8Array) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = "preview.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};

/** อัปโหลด PDF ที่ออกจริงแล้วขึ้น Storage ไว้เป็นหลักฐาน/คลังเอกสารกลาง คืน URL ให้บันทึกไว้ใน AnnouncementRecord.pdfUrl */
export const uploadAnnouncementPdf = async (
  bytes: Uint8Array,
  documentNumber: string
): Promise<string> => {
  const storage = getStorage();
  const safeNumber = documentNumber.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `announcements/${safeNumber}-${Date.now()}.pdf`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, bytes, { contentType: "application/pdf" });
  return getDownloadURL(fileRef);
};

export const downloadAnnouncementPdf = async (
  record: AnnouncementRecord,
  options: { documentNumber?: string; isDraft?: boolean } = {}
): Promise<Uint8Array> => {
  const bytes = await generateAnnouncementPdf(record, options);
  const numberSuffix = options.documentNumber ? ` (${options.documentNumber})` : " - ร่าง";
  downloadBlob(bytes, `ประกาศ${numberSuffix} - ${record.title}.pdf`);
  return bytes;
};
