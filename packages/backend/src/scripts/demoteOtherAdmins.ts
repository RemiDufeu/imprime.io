import '../loadEnv.js'
import { runAdminCommand } from './runAdminCommand.js'

/**
 * Makes the account of ADMIN_EMAIL the only administrator. The role stays in
 * the database when ADMIN_EMAIL changes: run this afterwards to take it from
 * the former administrator. The accounts demoted are signed out.
 *
 *   npm run admin:demote-others --workspace=@imprime/backend
 *
 * (`admin:demote-others:dev` runs the source, without a build.)
 */
await runAdminCommand(async (auth) => {
  const { adminEmail, adminExists, demoted } = await auth.demoteOtherAdmins()
  console.log(adminExists
    ? `${adminEmail} is the administrator.`
    : `${adminEmail} has no account yet: whoever signs in first with it becomes the administrator.`)
  console.log(demoted.length > 0
    ? `Admin role removed, and sessions signed out: ${demoted.join(', ')}`
    : 'No other account had the admin role.')
})
