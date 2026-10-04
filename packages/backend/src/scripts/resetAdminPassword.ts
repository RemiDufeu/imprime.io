import '../loadEnv.js'
import { generateRandomString } from 'better-auth/crypto'
import { runAdminCommand } from './runAdminCommand.js'

/**
 * Creates the administrator's account on a new instance, and is the
 * break-glass access for whoever runs the server when the administrator
 * cannot sign in any more — single sign-on down, no SMTP for "Forgot
 * password", a password forgotten. Gives the account of ADMIN_EMAIL a new
 * password, printed once, creating the account if there is none.
 *
 *   npm run admin:reset-password --workspace=@imprime/backend
 *
 * (`admin:reset-password:dev` runs the source, without a build.)
 */
await runAdminCommand(async (auth) => {
  const password = generateRandomString(24, 'a-z', 'A-Z', '0-9')
  const { email, outcome } = await auth.resetAdminPassword(password)
  console.log(outcome === 'created'
    ? `Admin account created for ${email}.`
    : `Password of ${email} reset; its sessions, API keys and MCP tokens were revoked.`)
  console.log(`Password: ${password}`)
  console.log('It is shown only once. Sign in with it, then replace it with "Forgot password" once email works.')
})
