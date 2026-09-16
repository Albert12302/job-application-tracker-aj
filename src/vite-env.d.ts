/// <reference types="vite/client" />

// Every VITE_ var is compiled into the public bundle (SPEC §7.4). Only these
// three exist; a new one is a decision, so it gets declared here first.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
