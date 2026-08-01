/**
 * Base URL resolution.
 *
 * In production the frontend is served statically by the backend on the same
 * origin, so all API/auth calls use relative paths (`API_ORIGIN` is empty).
 *
 * In development set `VITE_API_URL` to the backend origin
 * (e.g. `http://localhost:3023`) so the Vite dev server can reach it.
 */
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const API_BASE = `${API_ORIGIN}/api`
export const AUTH_BASE = `${API_ORIGIN}/api/auth`
