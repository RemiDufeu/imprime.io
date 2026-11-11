import '../loadEnv.js'
import { generateRandomString } from 'better-auth/crypto'
import { runAdminCommand } from './runAdminCommand.js'

/**
 * Acts on an account, by its address, for whoever runs the server:
 *
 *   npm run admin grant you@example.com            gives the admin role
 *   npm run admin demote someone@example.com       takes it, and signs out
 *   npm run admin reset-password you@example.com  a new password, printed once
 *
 * The first account of an instance is made administrator when it signs up;
 * these are for every change after. (`admin:dev` runs the source, without a
 * build.)
 */

const USAGE = 'Usage: npm run admin grant|demote|reset-password <email>'
const [action, email] = process.argv.slice(2)

if (!email) {
  console.error(USAGE)
  process.exitCode = 1
} else if (action === 'grant') {
  await runAdminCommand(async (auth) => {
    const { email: account, changed } = await auth.grantAdmin(email)
    console.log(changed ? `${account} is now an administrator.` : `${account} is already an administrator.`)
  })
} else if (action === 'demote') {
  await runAdminCommand(async (auth) => {
    const { email: account, changed, adminsLeft } = await auth.demoteAdmin(email)
    console.log(changed
      ? `${account} is no longer an administrator, and was signed out.`
      : `${account} is not an administrator.`)
    if (adminsLeft === 0) console.log('No administrator is left: npm run admin grant <email> gives the role back.')
  })
} else if (action === 'reset-password') {
  await runAdminCommand(async (auth) => {
    const password = generateRandomString(24, 'a-z', 'A-Z', '0-9')
    const { email: account } = await auth.resetPassword(email, password)
    console.log(`Password of ${account} reset. Its address is marked verified; its sessions, API keys and MCP tokens were revoked.`)
    console.log(`Password: ${password}`)
    console.log('It is shown only once. Sign in with it, then replace it with "Forgot password?" once email works.')
  })
} else {
  console.error(USAGE)
  process.exitCode = 1
}
