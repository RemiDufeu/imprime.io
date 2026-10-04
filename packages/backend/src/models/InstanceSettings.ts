import { Schema, model, HydratedDocument } from 'mongoose'
import { PASSWORD_POLICIES, type PasswordPolicy, type SsoProvider } from '@imprime/common'

// The instance has a single settings document, under this id.
export const INSTANCE_SETTINGS_ID = 'instance'

export interface ISmtpSettings {
  host: string
  port: number
  secure: boolean
  user?: string
  // Encrypted with the auth secret (`AuthService.encrypt`); never sent out.
  password?: string
  from: string
}

// An OAuth application registered with a single sign-on provider.
export interface ISsoProviderSettings {
  clientId: string
  // Encrypted with the auth secret (`AuthService.encrypt`); never sent out.
  clientSecret: string
  // Microsoft only; absent means 'common'.
  tenantId?: string
}

// What the instance's admins configure from the administration pages rather
// than from the environment.
export interface IInstanceSettings {
  _id: string
  email: {
    // Absent while the instance has no SMTP server.
    smtp?: ISmtpSettings
    requireEmailVerification: boolean
  }
  // A provider is offered on the sign-in page while it is present.
  sso: Partial<Record<SsoProvider, ISsoProviderSettings>>
  // Absent in older documents, where anyone could use a password and every
  // domain was allowed: the defaults say so.
  access: {
    passwordPolicy: PasswordPolicy
    // Lower-cased, deduplicated.
    allowedDomains: string[]
  }
  createdAt?: Date
  updatedAt?: Date
}

const SmtpSettingsSchema = new Schema<ISmtpSettings>({
  host: { type: String, required: true },
  port: { type: Number, required: true },
  secure: { type: Boolean, required: true },
  user: { type: String },
  password: { type: String },
  from: { type: String, required: true },
}, { _id: false })

const SsoProviderSettingsSchema = new Schema<ISsoProviderSettings>({
  clientId: { type: String, required: true },
  clientSecret: { type: String, required: true },
  tenantId: { type: String },
}, { _id: false })

const InstanceSettingsSchema = new Schema<IInstanceSettings>({
  _id: { type: String, required: true },
  email: {
    smtp: { type: SmtpSettingsSchema },
    requireEmailVerification: { type: Boolean, required: true, default: false },
  },
  sso: {
    google: { type: SsoProviderSettingsSchema },
    github: { type: SsoProviderSettingsSchema },
    microsoft: { type: SsoProviderSettingsSchema },
  },
  access: {
    passwordPolicy: { type: String, enum: PASSWORD_POLICIES, required: true, default: 'open' },
    allowedDomains: { type: [String], default: [] },
  },
}, { timestamps: true })

export type InstanceSettingsDocument = HydratedDocument<IInstanceSettings>

export const InstanceSettingsModel = model<IInstanceSettings>('InstanceSettings', InstanceSettingsSchema)
