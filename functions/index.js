const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

initializeApp();

const db = getFirestore();
const ROOT_COLLECTION = "CMG-HR-Database";
const ROOT_DOC = db.collection(ROOT_COLLECTION).doc("root");
const ZK_REGION = "asia-southeast1";
const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const ACCESS_ROLES = new Set(["MasterAdmin", "MD", "GM", "HR", "Admin Site"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMP_CODE_RE = /^\S{1,64}$/;
const OVERNIGHT_EXIT_CUTOFF = "04:00";

let cachedToken = "";
let cachedTokenExpiresAt = 0;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class LeaseLostError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeBaseUrl = (value) => String(value || "").replace(/\\/g, "").trim().replace(/\/+$/, "");

const getZkConfig = () => {
  const baseUrl = normalizeBaseUrl(process.env.ZK_API_BASE_URL);
  const username = String(process.env.ZK_API_USERNAME || "").trim();
  const password = String(process.env.ZK_API_PASSWORD || "");
  const authScheme = String(process.env.ZK_API_AUTH_SCHEME || "JWT").trim() || "JWT";
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("ยังไม่ได้ตั้งค่า ZK_API_BASE_URL ใน backend");
  if (!username || !password) throw new Error("ยังไม่ได้ตั้งค่า ZK_API_USERNAME หรือ ZK_API_PASSWORD ใน backend");
  return { baseUrl, username, password, authScheme };
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text.slice(0, 300) };
  }
};

const requestZk = async (url, options = {}) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const body = await parseJsonResponse(response);
      if (response.ok) return body;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw new Error(`ZKBioTime request failed (${response.status})`);
      }
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("ZKBioTime request failed");
};

const getJwtToken = async () => {
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60000) return cachedToken;
  const config = getZkConfig();
  const body = await requestZk(`${config.baseUrl}/jwt-api-token-auth/`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const token = body && !Array.isArray(body) ? (body.token || body.access || body.access_token) : undefined;
  if (typeof token !== "string" || !token) throw new Error("ZKBioTime ไม่ส่ง JWT token กลับมา");
  const expiresIn = Number(body.expires_in || body.expires || 1800);
  cachedToken = token;
  cachedTokenExpiresAt = Date.now() + Math.max(300000, Math.min(expiresIn * 1000, 3600000)) - 60000;
  return cachedToken;
};

const getZkHeaders = (token) => ({
  Accept: "application/json",
  Authorization: `${getZkConfig().authScheme} ${token}`,
});

const hasEmployee = (payload) => {
  if (Array.isArray(payload)) return payload.length > 0;
  if (!payload || typeof payload !== "object") return false;
  const data = payload;
  if (Array.isArray(data.data)) return data.data.length > 0;
  if (Array.isArray(data.results)) return data.results.length > 0;
  if (typeof data.count === "number") return data.count > 0;
  return Boolean(data.id || data.emp_code || data.employee_id);
};

const getRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") throw new Error("รูปแบบข้อมูลลงเวลาจาก ZKBioTime ไม่ถูกต้อง");
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  throw new Error("รูปแบบข้อมูลลงเวลาจาก ZKBioTime ไม่ถูกต้อง");
};

const getNext = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return typeof payload.next === "string" ? payload.next : "";
};

const fetchTransactions = async (empCode, date, token) => {
  const config = getZkConfig();
  const url = new URL(`${config.baseUrl}/iclock/api/transactions/`);
  url.searchParams.set("emp_code", empCode);
  url.searchParams.set("start_time", `${date} 00:00:00`);
  url.searchParams.set("end_time", `${date} 23:59:59`);
  url.searchParams.set("page_size", "100");
  const rows = [];
  let payload = await requestZk(url.toString(), { headers: getZkHeaders(token) });
  rows.push(...getRows(payload));
  let next = getNext(payload);
  let page = 0;
  while (next) {
    if (++page > 100) throw new Error("รายการลงเวลามีจำนวนมากเกินขอบเขต");
    const nextUrl = new URL(next, url.toString());
    payload = await requestZk(nextUrl.toString(), { headers: getZkHeaders(token) });
    rows.push(...getRows(payload));
    next = getNext(payload);
  }
  return rows;
};

const fetchEmployee = async (empCode, token) => {
  const config = getZkConfig();
  const url = new URL(`${config.baseUrl}/personnel/api/employees/`);
  url.searchParams.set("emp_code", empCode);
  const payload = await requestZk(url.toString(), { headers: getZkHeaders(token) });
  if (!hasEmployee(payload)) throw new HttpError(404, `ไม่พบพนักงานรหัส ${empCode} ใน ZKBioTime`);
  return payload;
};

const addDays = (date, days) => {
  if (!DATE_RE.test(date)) throw new Error("วันที่ไม่ถูกต้อง");
  return new Date(`${date}T00:00:00Z`);
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const nextDate = (date, days = 1) => {
  const value = addDays(date, days);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
};

const normalizeTime = (value) => String(value || "").trim().replace(".", ":");

const parseTime = (value) => {
  const normalized = normalizeTime(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`เวลาโครงการไม่ถูกต้อง: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`เวลาโครงการไม่ถูกต้อง: ${value}`);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const bangkokStamp = (date, time) => Date.parse(`${date}T${parseTime(time)}:00+07:00`);

const parsePunchTime = (value) => {
  if (!value) return NaN;
  const raw = String(value).trim().replace(" ", "T");
  return Date.parse(`${raw}${/(Z|[+-]\d\d:\d\d)$/.test(raw) ? "" : "+07:00"}`);
};

const getActiveEmployees = async () => {
  const snapshot = await ROOT_DOC.collection("employee_data").get();
  const employees = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  return employees.filter((employee) => String(employee["สถานะพนักงาน"] || "").trim() === "ทำงาน");
};

const normalizeAttendanceRecord = (value) => {
  if (typeof value === "string") return { status: value, recordedAt: 0 };
  return value && typeof value === "object" ? { ...value } : null;
};

const getAttendanceRecord = (day, employeeId) => {
  const records = day && day.records && typeof day.records === "object" ? day.records : {};
  return normalizeAttendanceRecord(records[employeeId]);
};

const chooseCheckout = async (empCode, date, token) => {
  const next = nextDate(date);
  const nextDayStart = bangkokStamp(next, "00:00");
  const nextDayCutoff = bangkokStamp(next, OVERNIGHT_EXIT_CUTOFF);
  const chooseLatest = (rows, minTime, maxTime, { allowSingleUnknownState = false } = {}) => {
    const candidates = rows
      .filter((row) => row && row.punch_time)
      .map((row) => ({ row, time: parsePunchTime(row.punch_time) }))
      .filter(({ time }) => Number.isFinite(time) && time >= minTime && time < maxTime)
      .sort((a, b) => a.time - b.time);
    if (!candidates.length) return null;

    const latest = candidates[candidates.length - 1];
    // Some ZKBioTime terminals report the exit punch with punch_state=0,
    // even though other terminals report it as 1. Prefer the latest punch,
    // but do not mistake a lone morning check-in for a checkout.
    if (String(latest.row.punch_state) === "1") return latest.row;
    if (allowSingleUnknownState) return latest.row;
    if (candidates.length < 2) return null;

    // When the terminal gives no reliable state, two punches separated by a
    // meaningful interval identify the latter as the day's checkout. This
    // also avoids treating duplicate uploads of one check-in as an exit.
    const first = candidates[0];
    if (latest.time - first.time < 30 * 60 * 1000) return null;
    return latest.row;
  };

  // A punch from 04:00 onward belongs to the requested calendar day. The
  // early-morning window is reserved for the previous day's overnight work.
  const sameDay = chooseLatest(
    await fetchTransactions(empCode, date, token),
    bangkokStamp(date, OVERNIGHT_EXIT_CUTOFF),
    nextDayStart,
  );
  if (sameDay) return sameDay;

  // When the employee finishes after midnight, today's 00:00-03:59:59 punch
  // is stored as yesterday's checkout.
  return chooseLatest(
    await fetchTransactions(empCode, next, token),
    nextDayStart,
    nextDayCutoff,
    { allowSingleUnknownState: true },
  );
};

const fetchOneEmployeeCheckout = async ({ employee, date, token }) => {
  const empCode = String(employee["รหัสพนักงาน"] || "").trim();
  if (!EMP_CODE_RE.test(empCode)) throw new Error("ไม่มีรหัสพนักงานที่ถูกต้อง");

  const last = await chooseCheckout(empCode, date, token);
  return {
    employeeId: employee.id,
    checkout: last?.punch_time || "",
    checkoutTransactionId: String(last?.id || ""),
    checkoutFetchedAt: Date.now(),
    hasPunch: Boolean(last),
  };
};

const runPool = async (items, worker, concurrency = 8) => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
};

const syncAttendanceForDate = async (date, { force = false, updateSetting = false } = {}) => {
  if (!DATE_RE.test(date)) throw new Error("วันที่ไม่ถูกต้อง");
  const employees = await getActiveEmployees();
  const dayRef = ROOT_DOC.collection("attendance").doc(date);
  const jobRef = ROOT_DOC.collection("zkteco_attendance_jobs").doc(date);
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data() || {};
    if ((job.leaseUntil || 0) > Date.now() || (!force && job.done)) return false;
    transaction.set(jobRef, {
      owner,
      date,
      startedAt: Date.now(),
      leaseUntil: Date.now() + 540000,
      done: false,
      failures: 0,
    }, { merge: true });
    return true;
  });
  if (!acquired) return {
    processed: 0,
    skipped: true,
    updated: 0,
    missingPunch: 0,
    failed: 0,
    skippedAmbiguous: 0,
    skippedOtherProject: 0,
    failures: [],
    skippedDetails: [],
  };

  const summary = {
    processed: 0,
    updated: 0,
    missingPunch: 0,
    failed: 0,
    skippedAmbiguous: 0,
    skippedOtherProject: 0,
    failures: [],
    skippedDetails: [],
  };
  try {
    const token = await getJwtToken();
    const checkoutResults = [];
    await runPool(employees, async (employee) => {
      try {
        const result = await fetchOneEmployeeCheckout({ employee, date, token });
        checkoutResults.push(result);
        summary.processed += 1;
        summary.updated += 1;
        if (!result.hasPunch) summary.missingPunch += 1;
      } catch (error) {
        summary.failed += 1;
        if (summary.failures.length < 20) {
          summary.failures.push({
            employeeId: employee.id,
            empCode: String(employee["รหัสพนักงาน"] || ""),
            reason: error instanceof Error ? error.message : "ไม่ทราบสาเหตุ",
          });
        }
      }
    }, 12);
    await db.runTransaction(async (transaction) => {
      const jobSnapshot = await transaction.get(jobRef);
      const daySnapshot = await transaction.get(dayRef);
      const job = jobSnapshot.data() || {};
      if (job.owner !== owner) throw new LeaseLostError("lease lost");
      const day = daySnapshot.data() || {};
      const records = day.records && typeof day.records === "object" ? { ...day.records } : {};
      for (const result of checkoutResults) {
        const latest = getAttendanceRecord(day, result.employeeId);
        // Avoid creating thousands of empty records when there is neither an
        // attendance status nor a punch to save.
        if (!latest && !result.hasPunch) continue;
        records[result.employeeId] = {
          ...(latest || { status: "", recordedAt: 0 }),
          checkout: result.checkout,
          checkoutTransactionId: result.checkoutTransactionId,
          checkoutFetchedAt: result.checkoutFetchedAt,
        };
      }
      // Write only the checkout fields. Existing attendance status, project,
      // leave metadata, and manual timestamps remain unchanged.
      transaction.set(dayRef, { date, records }, { merge: true });
      const done = summary.failed === 0;
      const storedSummary = {
        processed: summary.processed,
        updated: summary.updated,
        missingPunch: summary.missingPunch,
        failed: summary.failed,
        skippedAmbiguous: summary.skippedAmbiguous,
        skippedOtherProject: summary.skippedOtherProject,
      };
      transaction.set(jobRef, {
        done,
        leaseUntil: 0,
        failures: summary.failed,
        failureDetails: summary.failures,
        skippedDetails: summary.skippedDetails,
        summary: storedSummary,
        completedAt: done ? Date.now() : 0,
      }, { merge: true });
      if (done && updateSetting) {
        const settingRef = ROOT_DOC.collection("ot_scan_settings").doc("global");
        transaction.set(settingRef, {
          project: "all",
          lastDate: date,
          lastSuccess: Date.now(),
          lastSummary: storedSummary,
        }, { merge: true });
      }
    });
    return summary;
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const jobSnapshot = await transaction.get(jobRef);
      const job = jobSnapshot.data() || {};
      if (job.owner === owner) transaction.set(jobRef, { done: false, leaseUntil: 0, error: error instanceof Error ? error.message : "ไม่ทราบสาเหตุ" }, { merge: true });
    });
    throw error;
  }
};

const publicSyncSummary = (summary = {}) => ({
  processed: Number(summary.processed || 0),
  updated: Number(summary.updated || 0),
  missingPunch: Number(summary.missingPunch || 0),
  failed: Number(summary.failed || 0),
  skippedAmbiguous: Number(summary.skippedAmbiguous || 0),
  skippedOtherProject: Number(summary.skippedOtherProject || 0),
  failureDetails: Array.isArray(summary.failures) ? summary.failures : [],
  skippedDetails: Array.isArray(summary.skippedDetails) ? summary.skippedDetails : [],
});

const bangkokDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const isDue = (time) => Date.now() >= bangkokStamp(bangkokDate(), time);

const verifyCaller = async (request, roles = []) => {
  const header = String(request.headers.authorization || "");
  if (!header.startsWith("Bearer ")) throw new HttpError(401, "ต้องเข้าสู่ระบบก่อนเรียกใช้งาน");
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(header.slice(7));
  } catch (_error) {
    throw new HttpError(401, "สิทธิ์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง");
  }
  const profile = (await ROOT_DOC.collection("users").doc(decoded.uid).get()).data() || {};
  if (profile.status !== "approved") throw new HttpError(403, "บัญชียังไม่ได้รับอนุมัติ");
  const userRoles = Array.isArray(profile.role) ? profile.role : [profile.role];
  if (roles.length && !userRoles.some((role) => roles.includes(role))) throw new HttpError(403, "ไม่มีสิทธิ์ใช้งานการดึงข้อมูล OT");
  return { uid: decoded.uid, roles: userRoles };
};

const setCors = (response, request) => {
  const origin = String(request.headers.origin || "");
  const configured = String(process.env.ZK_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && (configured.length === 0 || configured.includes(origin))) response.set("Access-Control-Allow-Origin", origin);
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
};

const sendError = (response, error) => {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "ระบบ backend ไม่สามารถดึงข้อมูลได้";
  if (status >= 500) console.error(message);
  response.status(status).json({ error: message });
};

exports.zktecoAttendance = onRequest({ region: ZK_REGION, timeoutSeconds: 60, memory: "256MiB" }, async (request, response) => {
  setCors(response, request);
  if (request.method === "OPTIONS") return response.status(204).send("");
  if (request.method !== "GET") return response.status(405).json({ error: "รองรับเฉพาะ GET" });
  try {
    await verifyCaller(request);
    const empCode = String(request.query.emp_code || "").trim();
    const date = String(request.query.date || "").trim();
    if (!EMP_CODE_RE.test(empCode)) throw new HttpError(400, "กรุณาระบุรหัสพนักงานเป็นตัวเลขหรือตัวอักษร");
    if (!DATE_RE.test(date)) throw new HttpError(400, "กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD");
    const token = await getJwtToken();
    const employee = await fetchEmployee(empCode, token);
    const transactions = await fetchTransactions(empCode, date, token);
    return response.json({ emp_code: empCode, date, start_time: `${date} 00:00:00`, end_time: `${date} 23:59:59`, employee, transactions });
  } catch (error) {
    return sendError(response, error);
  }
});

exports.zktecoSyncNow = onRequest({ region: ZK_REGION, timeoutSeconds: 3600, memory: "512MiB", maxInstances: 1 }, async (request, response) => {
  setCors(response, request);
  if (request.method === "OPTIONS") return response.status(204).send("");
  if (request.method !== "POST") return response.status(405).json({ error: "รองรับเฉพาะ POST" });
  try {
    await verifyCaller(request, Array.from(ACCESS_ROLES));
    const date = String(request.body?.date || nextDate(bangkokDate(), -1)).trim();
    if (!DATE_RE.test(date)) throw new HttpError(400, "วันที่ไม่ถูกต้อง");
    const summary = await syncAttendanceForDate(date, { force: true });
    return response.json({ date, summary: publicSyncSummary(summary) });
  } catch (error) {
    return sendError(response, error);
  }
});

exports.syncZktecoOt = onSchedule({ schedule: "every 5 minutes", timeZone: BANGKOK_TIME_ZONE, region: ZK_REGION, timeoutSeconds: 540, memory: "512MiB" }, async () => {
  const settings = await ROOT_DOC.collection("ot_scan_settings").get();
  const today = bangkokDate();
  const yesterday = nextDate(today, -1);
  const globalDoc = settings.docs.find((item) => item.id === "global");
  const globalSetting = globalDoc?.data() || null;
  const candidates = globalSetting?.enabled
    ? [{ settingDoc: globalDoc, setting: globalSetting, target: globalSetting.lastDate ? nextDate(String(globalSetting.lastDate)) : yesterday }]
    : settings.docs
      .filter((item) => item.id !== "global" && item.data()?.enabled)
      .map((item) => {
        const setting = item.data() || {};
        return {
          settingDoc: item,
          setting,
          target: setting.lastDate ? nextDate(String(setting.lastDate)) : yesterday,
        };
      });

  const dueCandidates = candidates
    .filter(({ setting, target }) => isDue(setting.time || "09:00") && target <= yesterday)
    .sort((a, b) => a.target.localeCompare(b.target));
  if (!dueCandidates.length) return;

  // A legacy project setting may still exist. It is used only as a trigger;
  // the actual sync is now global and runs once per target date.
  const target = dueCandidates[0].target;
  try {
    const summary = await syncAttendanceForDate(target, { updateSetting: Boolean(globalSetting?.enabled) });
    if (!summary.skipped && summary.failed === 0) {
      const batch = db.batch();
      dueCandidates.filter((item) => item.target === target).forEach(({ settingDoc }) => {
        batch.set(settingDoc.ref, {
          project: "all",
          lastDate: target,
          lastSuccess: Date.now(),
          lastSummary: {
            processed: summary.processed,
            updated: summary.updated,
            missingPunch: summary.missingPunch,
            failed: summary.failed,
          },
        }, { merge: true });
      });
      await batch.commit();
    }
    console.log(`ZKBioTime attendance sync ${target}: ${summary.updated || 0} updated, ${summary.failed || 0} failed`);
  } catch (error) {
    console.error(`ZKBioTime attendance sync failed for ${target}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
});
