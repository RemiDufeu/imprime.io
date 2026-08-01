import '../loadEnv.js'
import nodemailer, { type Transporter } from 'nodemailer'

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth?: { user: string; pass: string }
  from: string
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

const smtpConfig = readSmtpConfig()

let transporter: Transporter | undefined
if (smtpConfig) {
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  })
}

export const isSmtpConfigured = Boolean(transporter)

export async function sendMail(options: {
  to: string
  subject: string
  text?: string
  html?: string
}): Promise<void> {
  if (!transporter || !smtpConfig) {
    throw new Error('SMTP is not configured')
  }
  await transporter.sendMail({
    from: smtpConfig.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}
