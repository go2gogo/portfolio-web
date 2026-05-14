/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;



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

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => GoogleTokenClient;
      };
    };
  };
}

declare const __COMMIT_HASH__: string;

