import type { User } from "firebase/auth";

export interface ZktecoTransaction {
  id?: string | number;
  emp_code?: string;
  punch_time?: string;
  punch_state?: string | number;
  verify_type?: string | number;
  terminal_alias?: string;
  upload_time?: string;
  [key: string]: unknown;
}

export interface ZktecoAttendanceResponse {
  emp_code: string;
  date: string;
  start_time: string;
  end_time: string;
  employee: unknown;
  transactions: ZktecoTransaction[];
}

export interface FetchZktecoAttendanceParams {
  user: User;
  empCode: string;
  date: string;
}

const getBackendBaseUrl = () => {
  const configured = (process.env.REACT_APP_ZK_FUNCTIONS_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const localHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
  return localHost || window.location.port === "3000" ? "https://cmg-hr-database.web.app" : window.location.origin;
};

const parseResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text.slice(0, 500) };
  }
};

const requestBackend = async (url: string, options: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await parseResponse(response);
    if (!response.ok) {
      const bodyMessage = body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).error || (body as Record<string, unknown>).message
        : undefined;
      const error = new Error(typeof bodyMessage === "string" ? bodyMessage : `เรียก backend ไม่สำเร็จ (${response.status})`);
      throw error;
    }
    return body as ZktecoAttendanceResponse & { error?: string };
  } finally {
    window.clearTimeout(timeout);
  }
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.name === "AbortError") {
    return "ZKBioTime ไม่ตอบสนองภายในเวลาที่กำหนด";
  }
  if (error instanceof TypeError) {
    return "เรียก backend ไม่ได้ กรุณาตรวจสอบการ deploy และการเชื่อมต่อ";
  }
  return error instanceof Error ? error.message : "ไม่สามารถดึงข้อมูลจาก ZKBioTime ได้";
};

export const fetchZktecoAttendance = async ({
  user,
  empCode,
  date,
}: FetchZktecoAttendanceParams): Promise<ZktecoAttendanceResponse> => {
  const normalizedEmpCode = empCode.trim();
  if (!/^\d{1,32}$/.test(normalizedEmpCode)) {
    throw new Error("กรุณาระบุรหัสพนักงานเป็นตัวเลข");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD");
  }

  try {
    const url = new URL(`${getBackendBaseUrl()}/api/zkteco/attendance`, window.location.origin);
    const idToken = await user.getIdToken();
    url.searchParams.set("emp_code", normalizedEmpCode);
    url.searchParams.set("date", date);
    const body = await requestBackend(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!body || !Array.isArray(body.transactions)) {
      throw new Error("backend ส่งข้อมูลลงเวลาไม่ครบ");
    }
    return body;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getPunchStateLabel = (punchState: unknown): string => {
  const normalized = String(punchState ?? "");
  if (normalized === "0") return "เข้า";
  if (normalized === "1") return "ออก";
  return normalized || "ไม่ระบุ";
};
