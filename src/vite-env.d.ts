/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 'true' shows the magic-link sign-in option; anything else hides it. */
  readonly VITE_ENABLE_MAGIC_LINK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The app version from package.json, injected by `define` in vite.config.ts. */
declare const __APP_VERSION__: string
