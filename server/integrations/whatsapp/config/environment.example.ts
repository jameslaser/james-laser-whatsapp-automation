/** Variable names only. Configure real values through the project secret manager. */
export const serverEnvironmentVariableNames = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "META_GRAPH_API_VERSION",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_BASE_URL",
  "DATABASE_URL",
] as const;
