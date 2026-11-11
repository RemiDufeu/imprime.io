import { closeAuthDb, connectAuthDb } from '../config/authDb.js'
import { AuthService } from '../services/AuthService.js'
import { MailerService } from '../services/MailerService.js'

/**
 * Runs an administration command for whoever runs the server, with its
 * environment, against the auth database. A failure prints its message and
 * sets a non-zero exit code.
 *
 * Commands are their own composition root: they need the auth database and
 * nothing else, so they build the one service they use rather than start
 * every other one through `services/index.ts`.
 */
export async function runAdminCommand(command: (auth: AuthService) => Promise<void>): Promise<void> {
  await connectAuthDb()
  try {
    await command(new AuthService(new MailerService()))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await closeAuthDb()
  }
}
