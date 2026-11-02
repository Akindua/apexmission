/**
 * Client-safe environment variables.
 * Only VITE_* prefixed vars are exposed to the client bundle.
 * Never put secrets here.
 */

export const VITE_VAPID_PUBLIC_KEY = import.meta.env["VITE_VAPID_PUBLIC_KEY"] ?? "";
export const VITE_SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] ?? "";
export const VITE_SUPABASE_PUBLISHABLE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";