import nodemailer, { type Transporter } from 'nodemailer'

interface SmtpConfig {
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

function readSmtpConfig(): SmtpConfig | undefined {
  const host = process.env.SMTP_HOST
  if (!host) return undefined
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user
  if (!from) return undefined
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: user && pass ? { user, pass } : undefined,
    from,
  }
}

export class MailerService {
  private readonly config?: SmtpConfig
  private readonly transporter?: Transporter

  constructor() {
    this.config = readSmtpConfig()
    if (this.config) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
      })
    }
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
}
