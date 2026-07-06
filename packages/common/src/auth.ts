/**
 * Utilisateur authentifié tel qu'exposé aux couches applicatives (posé par le
 * middleware d'auth sur `req.user`). Partagé entre backend et frontend.
 */
export interface AuthUser {
  id: string
  email?: string
}
