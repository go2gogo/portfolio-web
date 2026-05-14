// Google OAuth 2.0 — 첫 로그인은 implicit flow redirect (모바일 안정성),
// 이후 토큰 갱신은 GIS Token Client 의 silent refresh (hidden iframe) 사용.
// — Drive appdata 스코프만 (이메일·프로필 미요청)
// — Token 은 localStorage 에 1시간 캐시
// — 만료 5분 전 자동 silent refresh 시도, 실패하면 다음 API 호출 시 null 반환


const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

if (!CLIENT_ID) {
  throw new Error("VITE_GOOGLE_CLIENT_ID is not configured.");
}

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
//const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_VALUE = "drive_auth_v1";

// localStorage keys
const TOKEN_KEY = "gdrive_token_cache";
const WAS_SIGNED_IN_KEY = "gdrive_was_signed_in";
//const PRE_AUTH_PATH_KEY = "gdrive_pre_auth_path";

// silent refresh 를 토큰 만료 N ms 전에 시도
const SILENT_REFRESH_LEAD_MS = 5 * 60 * 1000;

interface CachedToken { token: string; expiresAt: number; }

interface GisTokenResponse {
  access_token?: string;
  expires_in?: string | number;
  error?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrides?: { prompt?: string; hint?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: GisTokenResponse) => void;
    error_callback?: (err: unknown) => void;
    prompt?: string;
  }) => GisTokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let refreshTimer: number | null = null;
let tokenClient: GisTokenClient | null = null;
let pendingSilentResolvers: Array<(t: string | null) => void> = [];

function loadCachedToken(): void {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as CachedToken;
    if (cached.expiresAt > Date.now() + 30_000) {
      accessToken = cached.token;
      tokenExpiresAt = cached.expiresAt;
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch { /* noop */ }
}

function saveToken(token: string, expiresIn: number): void {
  accessToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token, expiresAt: tokenExpiresAt,
    } satisfies CachedToken));
    localStorage.setItem(WAS_SIGNED_IN_KEY, "1");
  } catch { /* noop */ }
  scheduleSilentRefresh();
}

function clearToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WAS_SIGNED_IN_KEY);
  } catch { /* noop */ }
}

// GIS 스크립트가 로드될 때까지 대기 후 token client 초기화 (idempotent)
function ensureTokenClient(): Promise<GisTokenClient | null> {
  if (tokenClient) return Promise.resolve(tokenClient);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) {
        tokenClient = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              resolveSilent(null);
              return;
            }
            const exp = typeof resp.expires_in === "string"
              ? parseInt(resp.expires_in, 10)
              : (resp.expires_in ?? 3600);
            saveToken(resp.access_token, exp);
            resolveSilent(resp.access_token);
          },
          error_callback: () => resolveSilent(null),
        });
        resolve(tokenClient);
        return;
      }
      // GIS 가 끝내 로드되지 않으면 (e.g. 네트워크 차단) 10초 후 포기
      if (Date.now() - start > 10_000) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

function resolveSilent(token: string | null): void {
  const list = pendingSilentResolvers;
  pendingSilentResolvers = [];
  list.forEach((r) => r(token));
}

// silent refresh 호출 — 사용자 동의 + Google 세션 있으면 hidden iframe 으로 새 토큰 발급
// 첫 로그인은 redirect 로 처리하므로 여기선 prompt: '' (interactive 없음) 만 사용
function requestSilentRefresh(): Promise<string | null> {
  if (!wasSignedIn()) return Promise.resolve(null);
  return new Promise((resolve) => {
    pendingSilentResolvers.push(resolve);
    void ensureTokenClient().then((client) => {
      if (!client) {
        resolveSilent(null);
        return;
      }
      try {
        // prompt: "none" — 완전 silent. 사용자 동의 / 계정 선택 등 UI 없음.
        //   필요한 경우 error_callback 으로 실패 (popup 안 뜸).
        // 빈 문자열 "" 은 "처음만 안 묻고 그 외엔 popup 가능" 이라 토큰 만료 시 팝업 노출됨.
        client.requestAccessToken({ prompt: "none" });
      } catch {
        resolveSilent(null);
      }
    });
  });
}

function scheduleSilentRefresh(): void {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!accessToken) return;
  const delay = Math.max(0, tokenExpiresAt - Date.now() - SILENT_REFRESH_LEAD_MS);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void requestSilentRefresh();
  }, delay);
}

// redirect_uri — Google Cloud Console 에 등록된 값과 정확히 일치해야 함
// 삭제


// 페이지 로드 시 즉시 — 1) 캐시 복원, 2) URL fragment 의 token 처리
loadCachedToken();
handleAuthRedirect();
scheduleSilentRefresh();

// 탭이 다시 활성화될 때 토큰이 곧 만료되면 미리 갱신 (background timer suspend 대비)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!wasSignedIn()) return;
    const needsRefreshSoon = !accessToken || (tokenExpiresAt - Date.now() < SILENT_REFRESH_LEAD_MS);
    if (needsRefreshSoon) void requestSilentRefresh();
  });
}

// 로그인 — 전체 페이지가 google 로 redirect (사용자 클릭 후)
// Promise 안 반환 — redirect 후 다시 돌아올 때 token 처리됨

export function signIn(): Promise<void> {
  return new Promise((resolve, reject) => {
    const googleApi = window.google;

    if (!googleApi?.accounts?.oauth2) {
      reject(new Error("Google Identity Services script is not loaded."));
      return;
    }

    const tokenClient = googleApi.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      prompt: "consent",
      callback: (response: {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      }) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Google sign-in failed."));
          return;
        }

        saveToken(response.access_token, response.expires_in ?? 3600);
        resolve();
      },
    });

    tokenClient.requestAccessToken();
  });
}


// URL fragment 에서 token 추출 — 페이지 로드 시 자동 호출
export function handleAuthRedirect(): boolean {
  if (typeof window === "undefined" || !window.location.hash) return false;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const state = hash.get("state");
  if (state !== STATE_VALUE) return false;

  const token = hash.get("access_token");
  const expiresIn = parseInt(hash.get("expires_in") ?? "3600", 10);
  const error = hash.get("error");

  // 에러 시 hash 제거하고 종료
  if (error || !token) {
    history.replaceState({}, "", window.location.pathname + window.location.search);
    return false;
  }

  saveToken(token, expiresIn);
  // URL hash 청소
  history.replaceState({}, "", window.location.pathname + window.location.search);
  return true;
}

// 토큰 가져오기 — 캐시 유효 시 즉시 반환, 만료/없음이면 silent refresh 시도
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) {
    return accessToken;
  }
  // 이전에 로그인한 적 있으면 silent refresh 시도 (사용자 클릭 불필요)
  if (wasSignedIn()) {
    const refreshed = await requestSilentRefresh();
    if (refreshed) return refreshed;
  }
  return null;  // 사용자가 다시 signIn() 호출 필요
}

// 로그아웃 — token revoke + localStorage 삭제
export async function signOut(): Promise<void> {
  const t = accessToken;
  clearToken();
  if (t) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch { /* network 실패 무시 */ }
  }
}

// 이전 로그인 흔적 — UI 에서 "재로그인 가능" 힌트용
export function wasSignedIn(): boolean {
  try { return localStorage.getItem(WAS_SIGNED_IN_KEY) === "1"; } catch { return false; }
}

// 현재 토큰 유효 여부
export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt - 30_000;
}
