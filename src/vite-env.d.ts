/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_PROXY_URL?: string;
  readonly VITE_PROXY_URL_2?: string;
  readonly VITE_PROXY_URL_3?: string;
  readonly VITE_PROXY_URL_4?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;