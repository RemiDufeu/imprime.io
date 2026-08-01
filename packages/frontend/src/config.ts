/**
 * Base URL resolution.
 *
 * In production the frontend is served statically by the backend on the same
 * origin, so all API/auth calls use relative paths (`API_ORIGIN` is empty).
 *
 * In development set `VITE_API_URL` to the backend origin
 * (e.g. `http://localhost:3023`) so the Vite dev server can reach it.
 *
 * Better Auth requires an absolute URL for its client, so we fall back to
 * `window.location.origin` when no explicit origin is configured.
 */
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const AUTH_ORIGIN =
  API_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : '')

export const API_BASE = `${API_ORIGIN}/api`
export const AUTH_BASE = `${AUTH_ORIGIN}/api/auth`
