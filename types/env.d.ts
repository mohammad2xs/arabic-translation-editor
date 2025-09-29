declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: "development" | "production" | "test";
    LT_BASE_URL?: string;
    QURAN_API_BASE_URL?: string;
    PROJECT_MEMORY?: "true" | "false";
  }
}
