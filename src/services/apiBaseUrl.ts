const DEFAULT_DEV_API_BASE_URL = "http://localhost:8000";
const DEFAULT_PROD_API_BASE_URL = "/_/backend";

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL?.trim() ||
    (import.meta.env.PROD ? DEFAULT_PROD_API_BASE_URL : DEFAULT_DEV_API_BASE_URL)
);
