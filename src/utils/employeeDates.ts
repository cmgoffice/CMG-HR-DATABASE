/**
 * Employee birth-date / start-date resolution helpers.
 *
 * The employee_data collection contains a mix of:
 *  - Newer records saved via the in-app form, which use the schema field ids
 *    `date_of_birth` / `start_date` (HTML <input type="date"> -> "YYYY-MM-DD").
 *  - Legacy records bulk-imported from Excel/HR exports, which use Thai
 *    column names and a variety of date formats:
 *      - "วันเกิดปีเดือนวัน_คศ"            -> "D/M/YYYY" (Christian era)
 *      - "วันเกิด"                          -> "D/M/YYYY" (Buddhist era, ปี พ.ศ.)
 *      - "วันที่เริ่มงาน_ปีเดือนวัน_คศ"     -> "YYYYMMDD" (Christian era)
 *      - "วันเริ่มงาน"                      -> "D/M/YYYY" (Christian era)
 *
 * These helpers normalise all of the above into a plain "YYYY-MM-DD" string
 * so the rest of the app (age/tenure calculations, donut charts, etc.) can
 * keep using simple `new Date(...)` parsing regardless of which source the
 * data originally came from.
 */

const pad2 = (n: number): string => String(n).padStart(2, "0");

const isPlausibleYear = (year: number): boolean => year >= 1900 && year <= 2100;

/** Parses a "D/M/YYYY" (or "DD/MM/YYYY") string. Returns null if malformed. */
const parseSlashDMY = (value: string): { day: number; month: number; year: number } | null => {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000; // just in case of 2-digit years
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
};

/** Parses an "YYYYMMDD" string. Returns null if malformed. */
const parseCompactYMD = (value: string): { day: number; month: number; year: number } | null => {
  const digits = value.trim();
  if (!/^\d{8}$/.test(digits)) return null;
  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  const day = parseInt(digits.slice(6, 8), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
};

const toIso = (parts: { day: number; month: number; year: number }): string =>
  `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;

/**
 * Normalises a raw date value (in any of the known source formats) to
 * "YYYY-MM-DD". `assumeBuddhistIfAmbiguous` controls how a plausible-but-large
 * year (e.g. 2515) is treated when it isn't already obviously Buddhist era
 * (> 2400).
 */
const normalizeRawDate = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toIso({ day: raw.getDate(), month: raw.getMonth() + 1, year: raw.getFullYear() });
  }
  // Firestore Timestamp-like object
  if (typeof raw === "object" && raw !== null && typeof (raw as any).toDate === "function") {
    const d: Date = (raw as any).toDate();
    if (Number.isNaN(d.getTime())) return null;
    return toIso({ day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() });
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Already ISO ("YYYY-MM-DD" or with time component)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const ceYear = year > 2400 ? year - 543 : year;
    return toIso({ day, month, year: ceYear });
  }

  // "YYYYMMDD"
  const compact = parseCompactYMD(str);
  if (compact) {
    const ceYear = compact.year > 2400 ? compact.year - 543 : compact.year;
    return toIso({ ...compact, year: ceYear });
  }

  // "D/M/YYYY" - could be Buddhist or Christian era
  const slash = parseSlashDMY(str);
  if (slash) {
    const ceYear = slash.year > 2400 ? slash.year - 543 : slash.year;
    if (!isPlausibleYear(ceYear)) return null;
    return toIso({ ...slash, year: ceYear });
  }

  return null;
};

/** Field name candidates, in priority order, for an employee's date of birth. */
const DATE_OF_BIRTH_FIELDS = ["date_of_birth", "วันเกิดปีเดือนวัน_คศ", "วันเกิด"];

/** Field name candidates, in priority order, for an employee's start date. */
const START_DATE_FIELDS = ["start_date", "วันที่เริ่มงาน_ปีเดือนวัน_คศ", "วันเริ่มงาน"];

/**
 * Resolves an employee's date of birth to an ISO "YYYY-MM-DD" string,
 * checking the modern field first and falling back to legacy imported
 * fields/formats.
 */
export const resolveEmployeeDateOfBirth = (emp: Record<string, any> | null | undefined): string | null => {
  if (!emp) return null;
  for (const field of DATE_OF_BIRTH_FIELDS) {
    const normalized = normalizeRawDate(emp[field]);
    if (normalized) return normalized;
  }
  return null;
};

/**
 * Resolves an employee's start date to an ISO "YYYY-MM-DD" string,
 * checking the modern field first and falling back to legacy imported
 * fields/formats.
 */
export const resolveEmployeeStartDate = (emp: Record<string, any> | null | undefined): string | null => {
  if (!emp) return null;
  for (const field of START_DATE_FIELDS) {
    const normalized = normalizeRawDate(emp[field]);
    if (normalized) return normalized;
  }
  return null;
};
