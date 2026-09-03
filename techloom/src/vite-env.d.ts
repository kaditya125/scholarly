/// <reference types="vite/client" />

/** Injected by the `define` block in vite.config.ts. '' when SITE_URL is unset. */
declare const __SITE_URL__: string;

interface ImportMetaEnv {
  readonly VITE_CONTACT_ENDPOINT?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
