import axios, { type InternalAxiosRequestConfig } from "axios";

/**
 * 统一 axios 客户端。
 * - baseURL 走 Vite dev proxy(/api -> http://127.0.0.1:8000/api)
 * - withCredentials 保证 session cookie 跨端
 * - 默认 timeout 15s
 * - 自动从 cookie 读取 CSRF token 附带 X-CSRFToken
 */
export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  timeout: 15_000,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

type RetriableRequestConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean };
type CsrfRefreshOptions = { force?: boolean };

const CSRF_COOKIE = "csrftoken";
const CSRF_REFRESH_PATH = "/auth/csrf";

let csrfRefreshPromise: Promise<string> | null = null;

api.interceptors.request.use(async (config) => {
  if (isUnsafeMethod(config.method)) {
    let token = readCookie(CSRF_COOKIE);
    if (!token) token = await refreshCsrfToken();
    if (token) config.headers.set("X-CSRFToken", token);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (err) => {
    if (!axios.isAxiosError(err) || !isCsrfFailure(err.response?.data)) throw err;
    const config = err.config as RetriableRequestConfig | undefined;
    if (!config || config._csrfRetried || !isUnsafeMethod(config.method)) throw err;

    config._csrfRetried = true;
    const newToken = await refreshCsrfToken({ force: true });
    config.headers.set("X-CSRFToken", newToken);
    return api.request(config);
  }
);

async function refreshCsrfToken(options: CsrfRefreshOptions = {}): Promise<string> {
  if (options.force && !csrfRefreshPromise) {
    clearCsrfCookies();
  }
  if (!csrfRefreshPromise) {
    csrfRefreshPromise = api
      .get(CSRF_REFRESH_PATH)
      .then(() => {
        const token = readCookie(CSRF_COOKIE);
        csrfRefreshPromise = null;
        return token;
      })
      .catch((err) => {
        csrfRefreshPromise = null;
        throw err;
      });
  }
  return csrfRefreshPromise;
}

export function clearCsrfToken() {
  csrfRefreshPromise = null;
  clearCsrfCookies();
}

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/** 提取后端返回的 error 字段，fallback 到 DRF 默认错误体和 axios message。 */
export function extractApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data;
    const standardError = extractStandardError(body);
    if (standardError) return standardError;
    const message = extractMessage(body);
    return {
      code: status ? statusCodeToErrorCode(status) : "NETWORK_ERROR",
      message: message || err.message || "网络错误",
      details: isRecord(body) ? body : undefined,
    };
  }
  return {
    code: "UNKNOWN",
    message: "未知错误",
  };
}

function extractStandardError(body: unknown): ApiError | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message, details } = body.error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return {
    code,
    message,
    details: isRecord(details) ? details : undefined,
  };
}

function extractMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.map(stringifyErrorValue).filter(Boolean).join(" / ");
  if (!isRecord(body)) return "";
  if (typeof body.detail === "string") return normalizeDetail(body.detail);
  const fieldMessages = Object.entries(body)
    .map(([field, value]) => formatFieldError(field, value))
    .filter(Boolean);
  return fieldMessages.join(" / ");
}

function formatFieldError(field: string, value: unknown): string {
  const message = stringifyErrorValue(value);
  return message ? `${field}: ${message}` : "";
}

function stringifyErrorValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyErrorValue).filter(Boolean).join(", ");
  if (!isRecord(value)) return "";
  if (typeof value.message === "string") return value.message;
  return Object.values(value).map(stringifyErrorValue).filter(Boolean).join(", ");
}

function normalizeDetail(message: string): string {
  if (message.startsWith("CSRF Failed")) {
    return "登录状态校验失败，请刷新页面后重新登录。";
  }
  return message;
}

function statusCodeToErrorCode(status: number): string {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  return `HTTP_${status}`;
}

function isUnsafeMethod(method = "get"): boolean {
  return !["get", "head", "options", "trace"].includes(method.toLowerCase());
}

function isCsrfFailure(body: unknown): boolean {
  return (
    isRecord(body) &&
    typeof body.detail === "string" &&
    body.detail.startsWith("CSRF Failed")
  );
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const cookies = document.cookie
    .split("; ")
    .filter((item) => item.startsWith(prefix));
  const cookie = cookies[cookies.length - 1];
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

function clearCsrfCookies() {
  if (typeof document === "undefined") return;
  const expires = "Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const paths = ["/", "/api", "/api/v1"];
  const host = window.location.hostname;
  const domains = host ? ["", `; Domain=${host}`] : [""];

  for (const path of paths) {
    for (const domain of domains) {
      document.cookie = `${CSRF_COOKIE}=; ${expires}; Max-Age=0; Path=${path}${domain}; SameSite=Lax${secure}`;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
