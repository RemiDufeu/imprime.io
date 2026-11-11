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
  const { adminEmail, adminExists, adminPromoted, demoted } = await auth.demoteOtherAdmins()
  if (adminPromoted) console.log(`${adminEmail} is the administrator.`)
  else if (adminExists) console.log(`The account of ${adminEmail} has an unverified address, so nobody is administrator: run admin:reset-password to claim it.`)
  else console.log(`${adminEmail} has no account yet, so nobody is administrator: run admin:reset-password to create it.`)
  console.log(demoted.length > 0
    ? `Admin role removed, and sessions signed out: ${demoted.join(', ')}`
    : 'No other account had the admin role.')
})
