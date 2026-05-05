// Google OAuth 2.0 Implicit Flow (redirect-based)
// — 모바일 메모리 부족 환경에서 popup 보다 안정적
// — Drive appdata 스코프만 (이메일·프로필 미요청)
// — Token 은 localStorage 에 1시간 캐시 (만료되면 다시 redirect)

const CLIENT_ID = "329003207663-t43ejjbg1plt0l5u2kftpa41ofkq7e1o.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_VALUE = "drive_auth_v1";

// localStorage keys
const TOKEN_KEY = "gdrive_token_cache";
const WAS_SIGNED_IN_KEY = "gdrive_was_signed_in";
const PRE_AUTH_PATH_KEY = "gdrive_pre_auth_path";

interface CachedToken { token: string; expiresAt: number; }

let accessToken: string | null = null;
let tokenExpiresAt = 0;

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
}

function clearToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WAS_SIGNED_IN_KEY);
  } catch { /* noop */ }
}

// redirect_uri — Google Cloud Console 에 등록된 값과 정확히 일치해야 함
function getRedirectUri(): string {
  // gh-pages: https://hanjungwoo3.github.io/portfolio-web/
  // local:    http://localhost:5173/
  // pathname 끝에 슬래시 강제 (CSC 등록 형식 일치)
  const path = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : window.location.pathname + "/";
  return window.location.origin + path;
}

// 페이지 로드 시 즉시 — 1) 캐시 복원, 2) URL fragment 의 token 처리
loadCachedToken();
handleAuthRedirect();

// 로그인 — 전체 페이지가 google 로 redirect (사용자 클릭 후)
// Promise 안 반환 — redirect 후 다시 돌아올 때 token 처리됨
export function signIn(): void {
  // 로그인 후 돌아갈 path 저장 (예: 모달 다시 열림 등)
  try {
    localStorage.setItem(PRE_AUTH_PATH_KEY, window.location.pathname + window.location.search);
  } catch { /* noop */ }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "token",
    scope: SCOPE,
    state: STATE_VALUE,
    prompt: "consent",
    include_granted_scopes: "true",
  });
  window.location.href = `${AUTH_URL}?${params}`;
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

// 토큰 가져오기 — 캐시만 사용. 만료 시 null (재로그인 필요)
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) {
    return accessToken;
  }
  return null;  // 만료 → 사용자가 다시 signIn() 호출 필요
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
