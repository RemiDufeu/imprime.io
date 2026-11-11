import {
  PASSWORD_POLICIES,
  SSO_PROVIDERS,
  type AccessSettingsDTO,
  type EmailSettingsDTO,
  type PasswordPolicy,
  type SsoProvider,
  type SsoSettingsDTO,
} from '@imprime/common'
import {
  INSTANCE_SETTINGS_ID,
  InstanceSettingsModel,
  type IInstanceSettings,
  type ISmtpSettings,
  type ISsoProviderSettings,
} from '../models/InstanceSettings.js'
import {
  accessSettingsToDTO,
  emailSettingsToDTO,
  smtpSettingsToModel,
  ssoProviderToDTO,
  ssoProviderToModel,
} from '../models/mappers.js'
import { isAddressAllowed, type AuthService, type AuthSettings } from './AuthService.js'
import type { MailerService, SmtpConfig } from './MailerService.js'
import { AppError, ValidationError } from './errors.js'

const MAX_HOST_LENGTH = 253
// Implicit TLS: the server expects it from the first byte.
const SMTPS_PORT = 465

const invalid = (message: string, details?: string[]) =>
  new ValidationError(message, 'EMAIL_SETTINGS_INVALID', details)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+$/.test(value)
}

// An address, or a name and an address: "Imprime <no-reply@example.com>". The
// SMTP server judges the rest; only what would break the header is refused.
function isSender(value: string): boolean {
  return value.includes('@') && !/[\r\n]/.test(value)
}

/**
 * Validates an SMTP server as an admin sent it, collecting every problem
 * before throwing, and returns it normalised: trimmed, without an empty user,
 * and with TLS from the start on port 465.
 */
function parseSmtp(value: unknown): EmailSettingsDTO.SmtpUpdate {
  const smtp = isRecord(value) ? value : {}
  const errors: string[] = []

  const host = typeof smtp.host === 'string' ? smtp.host.trim() : ''
  if (!host) errors.push('The host is required')
  else if (host.length > MAX_HOST_LENGTH || /\s/.test(host)) errors.push('The host is not a valid host name')

  const port = typeof smtp.port === 'number' && Number.isInteger(smtp.port) && smtp.port >= 1 && smtp.port <= 65535
    ? smtp.port
    : undefined
  if (port === undefined) errors.push('The port must be a whole number between 1 and 65535')

  if (smtp.secure !== undefined && typeof smtp.secure !== 'boolean') errors.push('`secure` must be a boolean')
  if (smtp.user !== undefined && typeof smtp.user !== 'string') errors.push('The user must be a string')
  if (smtp.password !== undefined && typeof smtp.password !== 'string') errors.push('The password must be a string')

  const from = typeof smtp.from === 'string' ? smtp.from.trim() : ''
  if (!isSender(from)) {
    errors.push('The sender must be an email address, optionally with a name: "Imprime <no-reply@example.com>"')
  }

  if (errors.length > 0 || port === undefined) throw invalid('Invalid SMTP settings', errors)

  return {
    host,
    port,
    secure: smtp.secure === true || port === SMTPS_PORT,
    user: typeof smtp.user === 'string' && smtp.user.trim() ? smtp.user.trim() : undefined,
    password: typeof smtp.password === 'string' ? smtp.password : undefined,
    from,
  }
}

function toSmtpConfig(smtp: EmailSettingsDTO.SmtpUpdate | ISmtpSettings, password: string | undefined): SmtpConfig {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // Without both, the server is used without logging in.
    auth: smtp.user && password ? { user: smtp.user, pass: password } : undefined,
    from: smtp.from,
  }
}

const MAX_CREDENTIAL_LENGTH = 1024
// 'common', 'organizations', 'consumers', a tenant's GUID or one of its domains.
const MICROSOFT_TENANT = /^[A-Za-z0-9.-]{1,253}$/

const invalidSso = (message: string, details?: string[]) =>
  new ValidationError(message, 'SSO_SETTINGS_INVALID', details)

function isSsoProvider(value: unknown): value is SsoProvider {
  return SSO_PROVIDERS.some(provider => provider === value)
}

function parseSsoProvider(value: unknown): SsoProvider {
  if (isSsoProvider(value)) return value
  throw new ValidationError(`Unknown single sign-on provider "${String(value)}"`, 'SSO_PROVIDER_INVALID')
}

/**
 * Validates a provider's application as an admin sent it, collecting every
 * problem before throwing, and returns it trimmed, without an empty secret or
 * tenant.
 */
function parseSsoUpdate(provider: SsoProvider, value: unknown): SsoSettingsDTO.ProviderUpdate {
  const data = isRecord(value) ? value : {}
  const errors: string[] = []

  const clientId = typeof data.clientId === 'string' ? data.clientId.trim() : ''
  if (!clientId) errors.push('The client ID is required')
  else if (clientId.length > MAX_CREDENTIAL_LENGTH || /\s/.test(clientId)) errors.push('The client ID is not valid')

  const clientSecret = typeof data.clientSecret === 'string' ? data.clientSecret.trim() : ''
  if (data.clientSecret !== undefined && typeof data.clientSecret !== 'string') errors.push('The client secret must be a string')
  else if (clientSecret.length > MAX_CREDENTIAL_LENGTH) errors.push('The client secret is too long')

  const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : ''
  if (data.tenantId !== undefined && typeof data.tenantId !== 'string') errors.push('The tenant must be a string')
  else if (tenantId && provider !== 'microsoft') errors.push('Only Microsoft takes a tenant')
  else if (tenantId && !MICROSOFT_TENANT.test(tenantId)) {
    errors.push('The tenant must be "common", "organizations", "consumers", or a tenant ID or domain')
  }

  if (errors.length > 0) throw invalidSso(`Invalid ${provider} settings`, errors)

  return { clientId, clientSecret: clientSecret || undefined, tenantId: tenantId || undefined }
}

// A host name: labels of letters, digits and inner hyphens, at least two.
const DOMAIN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const MAX_ALLOWED_DOMAINS = 100

function isPasswordPolicy(value: unknown): value is PasswordPolicy {
  return PASSWORD_POLICIES.some(policy => policy === value)
}

/**
 * Validates access settings as an admin sent them, collecting every problem
 * before throwing, and returns the domains lower-cased, without a leading "@",
 * deduplicated.
 */
function parseAccess(value: unknown): AccessSettingsDTO.Update {
  const data = isRecord(value) ? value : {}
  const errors: string[] = []

  if (!isPasswordPolicy(data.passwordPolicy)) {
    errors.push(`The password policy must be one of: ${PASSWORD_POLICIES.join(', ')}`)
  }

  const allowedDomains: string[] = []
  if (!Array.isArray(data.allowedDomains)) {
    errors.push('The allowed domains must be a list')
  } else {
    for (const entry of data.allowedDomains) {
      const domain = typeof entry === 'string' ? entry.trim().toLowerCase().replace(/^@/, '') : ''
      if (!DOMAIN.test(domain)) errors.push(`"${String(entry)}" is not a domain`)
      else if (!allowedDomains.includes(domain)) allowedDomains.push(domain)
    }
    if (allowedDomains.length > MAX_ALLOWED_DOMAINS) errors.push(`At most ${MAX_ALLOWED_DOMAINS} domains`)
  }

  if (errors.length > 0 || !isPasswordPolicy(data.passwordPolicy)) {
    throw new ValidationError('Invalid access settings', 'ACCESS_SETTINGS_INVALID', errors)
  }
  return { passwordPolicy: data.passwordPolicy, allowedDomains }
}

function sameDomains(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every(domain => b.includes(domain))
}

// A stored password belongs to the server and the user it was entered with:
// kept for another host, it would be sent there — to whoever runs it — when
// the instance logs in, the test email included.
function keepsStoredPassword(smtp: EmailSettingsDTO.SmtpUpdate, stored: ISmtpSettings | undefined): stored is ISmtpSettings {
  return smtp.password === undefined &&
    Boolean(smtp.user) &&
    stored !== undefined &&
    stored.user === smtp.user &&
    stored.host.toLowerCase() === smtp.host.toLowerCase() &&
    stored.port === smtp.port
}

/**
 * The instance's settings, managed by its admins from the administration
 * pages rather than the environment. Every route that reaches it is behind
 * `requireAdmin`; the service trusts its caller.
 *
 * They live in one document — email, single sign-on, access — read at startup
 * (`load`) and applied to the mailer and better-auth in this process whenever
 * they change: a deployment
 * running several backend processes would only update the one that took the
 * request.
 */
export class SettingsService {
  constructor(
    private mailer: MailerService,
    private auth: AuthService,
  ) { }

  /** Applies the stored settings. Run once at startup, before the server takes a request. */
  public async load(): Promise<void> {
    await this.apply(await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID))
  }

  public async getEmail(): Promise<EmailSettingsDTO.Response> {
    const settings = await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID)
    return emailSettingsToDTO(settings?.email)
  }

  public async updateEmail(data: EmailSettingsDTO.Update): Promise<EmailSettingsDTO.Response> {
    if (!isRecord(data) || typeof data.requireEmailVerification !== 'boolean' || data.smtp === undefined) {
      throw invalid('Send `smtp` (null for none) and `requireEmailVerification`')
    }
    const smtp = data.smtp === null ? undefined : parseSmtp(data.smtp)
    if (data.requireEmailVerification && !smtp) {
      throw new ValidationError('Email verification needs an SMTP server', 'EMAIL_VERIFICATION_REQUIRES_SMTP')
    }

    const before = (await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID))?.email
    const email: IInstanceSettings['email'] = {
      smtp: smtp ? smtpSettingsToModel(smtp, await this.passwordToStore(smtp, before?.smtp)) : undefined,
      requireEmailVerification: data.requireEmailVerification,
    }
    const settings = await InstanceSettingsModel.findByIdAndUpdate(
      INSTANCE_SETTINGS_ID,
      { $set: { email } },
      { upsert: true, new: true },
    )

    await this.apply(settings)
    // Like the access settings: the rule reaches the sessions already open,
    // not only the next sign-in.
    if (email.requireEmailVerification && !before?.requireEmailVerification) {
      const signedOut = await this.auth.signOutUsers(user => !user.emailVerified)
      if (signedOut > 0) console.log(`Email verification required: ${signedOut} users with an unverified address signed out`)
    }
    return emailSettingsToDTO(settings.email)
  }

  /**
   * Sends one email through the server sent, or the stored one, without
   * saving anything. A failure carries the SMTP server's own words: they are
   * what an admin needs to fix the settings.
   */
  public async sendTestEmail(data: EmailSettingsDTO.TestRequest): Promise<void> {
    const to = isRecord(data) && typeof data.to === 'string' ? data.to.trim() : ''
    if (!isEmailAddress(to)) throw invalid('A valid recipient address is required')

    const settings = await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID)
    const config = await this.configToTest(data.smtp, settings?.email.smtp)
    try {
      await this.mailer.sendTestEmail(config, to)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new AppError(`The test email could not be sent: ${reason}`, 502, 'SMTP_TEST_FAILED')
    }
  }

  public async getAccess(): Promise<AccessSettingsDTO.Response> {
    const settings = await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID)
    return accessSettingsToDTO(settings?.access)
  }

  /**
   * Users the new settings shut out are signed out at once. Nothing is
   * refused: single sign-on only without an active provider leaves the
   * administrator as the only one who can sign in, which the admin page warns
   * about.
   */
  public async updateAccess(data: AccessSettingsDTO.Update): Promise<AccessSettingsDTO.Response> {
    const update = parseAccess(data)
    const before = accessSettingsToDTO((await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID))?.access)

    const settings = await InstanceSettingsModel.findByIdAndUpdate(
      INSTANCE_SETTINGS_ID,
      { $set: { access: update } },
      { upsert: true, new: true },
    )
    await this.apply(settings)
    await this.signOutShutOut(before, update)
    return accessSettingsToDTO(settings.access)
  }

  // Sessions last as long as they are used: without this, the new settings
  // would only reach users at their next sign-in.
  private async signOutShutOut(before: AccessSettingsDTO.Response, after: AccessSettingsDTO.Update): Promise<void> {
    const ssoOnlyNow = after.passwordPolicy === 'admins' && before.passwordPolicy !== 'admins'
    const domainsChanged = after.allowedDomains.length > 0 && !sameDomains(before.allowedDomains, after.allowedDomains)
    if (!ssoOnlyNow && !domainsChanged) return

    // Single sign-on only: everyone, since a session does not say how it was opened.
    const signedOut = await this.auth.signOutUsers(user => ssoOnlyNow || !isAddressAllowed(user, after.allowedDomains))
    if (signedOut > 0) console.log(`Access settings changed: ${signedOut} users signed out`)
  }

  public async getSso(): Promise<SsoSettingsDTO.Response> {
    const settings = await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID)
    return {
      google: await this.ssoStatus('google', settings),
      github: await this.ssoStatus('github', settings),
      microsoft: await this.ssoStatus('microsoft', settings),
    }
  }

  public async setSsoProvider(
    providerParam: string,
    data: SsoSettingsDTO.ProviderUpdate,
  ): Promise<SsoSettingsDTO.ProviderStatus> {
    const provider = parseSsoProvider(providerParam)
    const update = parseSsoUpdate(provider, data)
    const stored = (await InstanceSettingsModel.findById(INSTANCE_SETTINGS_ID))?.sso[provider]
    const clientSecret = await this.clientSecretToStore(update, stored)

    const settings = await InstanceSettingsModel.findByIdAndUpdate(
      INSTANCE_SETTINGS_ID,
      { $set: { [`sso.${provider}`]: ssoProviderToModel(update, clientSecret) } },
      { upsert: true, new: true },
    )
    await this.apply(settings)
    return this.ssoStatus(provider, settings)
  }

  /** The provider leaves the sign-in page; its users can still reset a password by email. */
  public async removeSsoProvider(providerParam: string): Promise<SsoSettingsDTO.ProviderStatus> {
    const provider = parseSsoProvider(providerParam)
    const settings = await InstanceSettingsModel.findByIdAndUpdate(
      INSTANCE_SETTINGS_ID,
      { $unset: { [`sso.${provider}`]: 1 } },
      { new: true },
    )
    await this.apply(settings)
    return this.ssoStatus(provider, settings)
  }

  private async ssoStatus(provider: SsoProvider, settings: IInstanceSettings | null): Promise<SsoSettingsDTO.ProviderStatus> {
    return {
      callbackUrl: await this.auth.ssoCallbackUrl(provider),
      config: ssoProviderToDTO(settings?.sso[provider]),
      active: this.auth.enabledProviders[provider],
    }
  }

  // Encrypted. A stored secret belongs to the client ID it was entered with.
  private async clientSecretToStore(
    update: SsoSettingsDTO.ProviderUpdate,
    stored: ISsoProviderSettings | undefined,
  ): Promise<string> {
    if (update.clientSecret) return this.auth.encrypt(update.clientSecret)
    if (stored && stored.clientId === update.clientId) return stored.clientSecret
    throw invalidSso('The client secret is required')
  }

  private async configToTest(sent: unknown, stored: ISmtpSettings | undefined): Promise<SmtpConfig> {
    if (sent !== undefined) {
      const smtp = parseSmtp(sent)
      const password = keepsStoredPassword(smtp, stored) ? await this.readStoredPassword(stored) : smtp.password
      return toSmtpConfig(smtp, password)
    }
    if (!stored) {
      throw new ValidationError('No SMTP server is configured', 'SMTP_NOT_CONFIGURED')
    }
    return toSmtpConfig(stored, await this.readStoredPassword(stored))
  }

  // Encrypted. An empty password removes the stored one, and so does a server
  // without a user: there is no one to log in as.
  private async passwordToStore(
    smtp: EmailSettingsDTO.SmtpUpdate,
    stored: ISmtpSettings | undefined,
  ): Promise<string | undefined> {
    if (keepsStoredPassword(smtp, stored)) return stored.password
    return smtp.user && smtp.password ? this.auth.encrypt(smtp.password) : undefined
  }

  // A password that no longer decrypts is left out rather than failing: the
  // server then refuses to send, and verification stays required instead of
  // turning itself off with the mailer.
  private async readStoredPassword(smtp: ISmtpSettings): Promise<string | undefined> {
    if (!smtp.password) return undefined
    try {
      return await this.auth.decrypt(smtp.password)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(
        `The stored SMTP password cannot be decrypted (${reason}): was BETTER_AUTH_SECRET changed? Enter it again in Administration → Email.`,
      )
      return undefined
    }
  }

  // A provider whose secret no longer decrypts is left out: the sign-in page
  // then offers no button that would fail, and the admin page shows it inactive.
  private async readSsoCredentials(sso: IInstanceSettings['sso'] | undefined): Promise<AuthSettings['sso']> {
    const credentials: AuthSettings['sso'] = {}
    for (const provider of SSO_PROVIDERS) {
      const stored = sso?.[provider]
      if (!stored) continue
      try {
        credentials[provider] = {
          clientId: stored.clientId,
          clientSecret: await this.auth.decrypt(stored.clientSecret),
          tenantId: stored.tenantId,
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(
          `The stored ${provider} client secret cannot be decrypted (${reason}): was BETTER_AUTH_SECRET changed? Enter it again in Administration → Single sign-on.`,
        )
      }
    }
    return credentials
  }

  private async apply(settings: IInstanceSettings | null): Promise<void> {
    const smtp = settings?.email.smtp
    this.mailer.configure(smtp ? toSmtpConfig(smtp, await this.readStoredPassword(smtp)) : null)
    this.auth.applySettings({
      requireEmailVerification: settings?.email.requireEmailVerification ?? false,
      passwordPolicy: settings?.access.passwordPolicy ?? 'open',
      allowedDomains: [...(settings?.access.allowedDomains ?? [])],
      sso: await this.readSsoCredentials(settings?.sso),
    })
  }
}
