/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Base URL of the calendar Worker, e.g. https://teto-cal.example.workers.dev (empty until deployed). */
  readonly VITE_CAL_API?: string;
}

interface Navigator {
  /** iOS Safari: true when launched from the Home Screen. */
  readonly standalone?: boolean;
}
