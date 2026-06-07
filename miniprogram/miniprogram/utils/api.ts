const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const COOKIE_STORAGE_KEY = "chrono_cookie";
const CSRF_STORAGE_KEY = "chrono_csrf_token";

type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type RequestData = string | WechatMiniprogram.IAnyObject | ArrayBuffer;

export interface MiniProgramCurrentUser {
  id: number;
  username: string;
  display_name: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_employed: boolean;
  left_at: string | null;
}

export interface MiniProgramLoginResponse {
  status: "registered" | "logged_in";
  is_new_user: boolean;
  user: MiniProgramCurrentUser;
  csrf_token: string;
}

export function loginWithWeChatCode(params: {
  code: string;
  nickname?: string;
  avatarUrl?: string;
}): Promise<MiniProgramLoginResponse> {
  return request<MiniProgramLoginResponse>({
    url: "/auth/oauth/wechat_miniprogram/register",
    method: "POST",
    data: {
      code: params.code,
      profile: {
        nickname: params.nickname || "",
        avatar_url: params.avatarUrl || "",
      },
    },
  });
}

export function request<T>(options: {
  url: string;
  method?: RequestMethod;
  data?: unknown;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const cookie = String(wx.getStorageSync(COOKIE_STORAGE_KEY) || "");
    const csrfToken = String(wx.getStorageSync(CSRF_STORAGE_KEY) || "");

    wx.request<RequestData>({
      url: `${API_BASE_URL}${options.url}`,
      method: (options.method || "GET") as WechatMiniprogram.RequestOption<RequestData>["method"],
      data: options.data as RequestData | undefined,
      header: {
        Cookie: cookie,
        "X-CSRFToken": csrfToken,
        "content-type": "application/json",
      },
      success(response) {
        persistCookies([
          ...(response.cookies || []),
          ...readSetCookieHeader(response.header),
        ]);

        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }

        reject(response.data);
      },
      fail: reject,
    });
  });
}

function readSetCookieHeader(header: WechatMiniprogram.IAnyObject): string[] {
  const setCookie = header["Set-Cookie"] || header["set-cookie"];
  if (Array.isArray(setCookie)) return setCookie;
  if (typeof setCookie === "string") return setCookie.split(/,\s*(?=[^;,]+=)/);
  return [];
}

function persistCookies(cookies: string[]): void {
  if (!cookies.length) return;

  const newCookiePairs = cookies
    .map((cookie) => cookie.split(";")[0].trim())
    .filter((cookie) => cookie.includes("="));
  if (!newCookiePairs.length) return;

  const existingCookieHeader = String(wx.getStorageSync(COOKIE_STORAGE_KEY) || "");
  wx.setStorageSync(COOKIE_STORAGE_KEY, mergeCookieHeader(existingCookieHeader, newCookiePairs));

  const csrfCookie = newCookiePairs.find((cookie) => cookie.startsWith("csrftoken="));
  if (csrfCookie) {
    wx.setStorageSync(CSRF_STORAGE_KEY, csrfCookie.replace("csrftoken=", ""));
  }
}

function mergeCookieHeader(existingCookieHeader: string, newCookiePairs: string[]): string {
  const cookieMap: Record<string, string> = {};

  existingCookieHeader.split(";").forEach((cookie) => setCookiePair(cookieMap, cookie.trim()));
  newCookiePairs.forEach((cookie) => setCookiePair(cookieMap, cookie));

  return Object.keys(cookieMap)
    .map((name) => `${name}=${cookieMap[name]}`)
    .join("; ");
}

function setCookiePair(cookieMap: Record<string, string>, cookiePair: string): void {
  const separatorIndex = cookiePair.indexOf("=");
  if (separatorIndex <= 0) return;

  const name = cookiePair.slice(0, separatorIndex);
  const value = cookiePair.slice(separatorIndex + 1);
  cookieMap[name] = value;
}
