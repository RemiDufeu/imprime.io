/**
 * Utilisateur authentifié tel qu'exposé aux couches applicatives (posé par le
 * middleware d'auth sur `req.user`). Partagé entre backend et frontend.
 */
export interface AuthUser {
  id: string
}

/**
 * Providers d'authentification activés côté serveur, exposés à l'UI pour
 * n'afficher que les options réellement disponibles.
 */
export interface EnabledAuthProviders {
  emailPassword: boolean
  google: boolean
  github: boolean
  microsoft: boolean
}
