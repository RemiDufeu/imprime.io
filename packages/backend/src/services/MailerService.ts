import nodemailer, { type Transporter } from 'nodemailer'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth?: { user: string; pass: string }
  from: string
}

interface SendMailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

// A sign-up waits for its verification email, so an unreachable server must
// fail it within seconds; nodemailer's defaults allow minutes.
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
}

function createTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    ...SMTP_TIMEOUTS,
  })
}

/**
 * Sends the instance's emails through the SMTP server its admins configured
 * (`SettingsService`). Without one, `isConfigured` is false and the features
 * that need email turn themselves off.
 */
export class MailerService {
  private config?: SmtpConfig
  private transporter?: Transporter

  /** Replaces the server emails go through; null leaves the instance without one. */
  public configure(config: SmtpConfig | null): void {
    this.transporter?.close()
    this.config = config ?? undefined
    this.transporter = config ? createTransport(config) : undefined
  }

  public get isConfigured(): boolean {
    return Boolean(this.transporter)
  }

  public async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.transporter || !this.config) {
      throw new Error('SMTP is not configured')
    }
    await this.transporter.sendMail({
      from: this.config.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
  }

  /** Sends one email through `config`, whether it is the configured server or not. */
  public async sendTestEmail(config: SmtpConfig, to: string): Promise<void> {
    const transporter = createTransport(config)
    try {
      await transporter.sendMail({
        from: config.from,
        to,
        subject: 'Imprime test email',
        text: 'This email was sent from the administration of your Imprime instance: its SMTP settings work.\n',
      })
    } finally {
      transporter.close()
    }
  }

  public async sendVerificationEmail(
    user: { email: string; name?: string },
    url: string,
  ): Promise<void> {
    const greeting = `Hello${user.name ? ' ' + user.name : ''}`
    await this.sendMail({
      to: user.email,
      subject: 'Verify your email address',
      text: `${greeting},\n\nClick the following link to verify your email address:\n${url}\n`,
      html: `<p>${greeting},</p><p>Click the following link to verify your email address:</p><p><a href="${url}">${url}</a></p>`,
    })
  }

  public async sendPasswordResetEmail(
    user: { email: string; name?: string },
    url: string,
  ): Promise<void> {
    const greeting = `Hello${user.name ? ' ' + user.name : ''}`
    await this.sendMail({
      to: user.email,
      subject: 'Reset your password',
      text: `${greeting},\n\nClick the following link to reset your password:\n${url}\n\nIf you didn't request a password reset, you can safely ignore this email.\n`,
      html: `<p>${greeting},</p><p>Click the following link to reset your password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request a password reset, you can safely ignore this email.</p>`,
    })
  }
}
