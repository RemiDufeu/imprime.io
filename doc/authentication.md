# Authentication and access

This page is for whoever deploys and administers an Imprime instance. It covers
every way into Imprime, where each one is configured, and the behaviours that
are easy to miss.

## Ways in

| Way in | For | Set up in | Good to know |
|---|---|---|---|
| Email and password | People, in the browser | Always available; who may use it: **Administration → Access** | Password reset and email verification need an SMTP server |
| Single sign-on: Google, GitHub, Microsoft | People, in the browser | **Administration → Single sign-on** | The first sign-in creates the account |
| API key | Scripts, the SDK, headless MCP clients | Each user, in **Settings → API Keys** | Sent in the `x-api-key` header. The access rules do not apply to it |
| MCP OAuth | Interactive AI clients, such as the Claude connector | Nothing to set up | The user signs in on the usual sign-in page, then the client holds a token |

## Where things are configured

| Setting | Where | Takes effect |
|---|---|---|
| `BETTER_AUTH_SECRET`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `MONGODB_URI` | Environment (`.env`, `docker-compose.yml`) | At startup |
| SMTP server, email verification | **Administration → Email** | At once |
| Google, GitHub, Microsoft | **Administration → Single sign-on** | At once |
| Password policy, allowed domains | **Administration → Access** | At once |
| API keys | **Settings → API Keys** | At once |
| The administrator's password, when locked out | `npm run admin:reset-password`, on the server | At once |
| Removing the role from former administrators | `npm run admin:demote-others`, on the server | At once |

The Administration pages are also available through the API, with an
administrator's API key: see *Settings Methods* in the
[SDK README](../packages/sdk/README.md).

### Environment variables

| Variable | Role |
|---|---|
| `BETTER_AUTH_SECRET` | Required: production refuses to start without it. It signs session cookies and encrypts the SMTP password and the SSO client secrets stored in the database. Generate one with `openssl rand -base64 32`. See [Changing the secret](#changing-the-secret) before you change it. |
| `PUBLIC_APP_URL` | The address users open, e.g. `https://imprime.example.com`. SSO callback URLs and the links in emails are built from it. |
| `CORS_ORIGIN` | Origins allowed to call the API, comma-separated. `*` is refused in production. |
| `ADMIN_EMAIL` | The administrator's address: see [The administrator](#the-administrator). |
| `MONGODB_URI` | Where accounts, sessions and settings live. It must be a replica set: see [MongoDB](#mongodb-must-be-a-replica-set). |

## Setting up a new instance

1. Set the environment variables above. `ADMIN_EMAIL` is the address you will
   sign in with. It can be the address of your Google account if you plan to
   sign in with Google.
2. Start the server. The log says
   `admin@example.com has no account yet: whoever signs in first with it becomes the administrator.`
3. Right away, open the app, choose **Sign up** and create the account with
   that address. You are the administrator: **Administration** appears in the
   avatar menu.
4. In **Administration → Email**, enter the SMTP server, click
   **Send test email**, then save. Turn on email verification if you want it.
5. In **Administration → Single sign-on**, register the providers you want.
6. In **Administration → Access**, choose who may use a password, and from
   which domains.

Do step 3 right after step 2. Until the administrator's account exists, anyone
who knows the address can sign up with it and become administrator.

## The administrator

An instance has one configured administrator: the account whose address is
`ADMIN_EMAIL`.

- **Always promoted.** Whoever signs in with that address, with a password or
  through single sign-on, is given the admin role. This happens at every
  sign-in and at every startup, whether or not the address was verified. The
  address then counts as verified, because the operator vouched for it by
  configuring it.
- **Through single sign-on.** `ADMIN_EMAIL` can be the address of a Google,
  GitHub or Microsoft account. If you signed up with a password first, a later
  sign-in with the provider lands on the same account.
- **Claims are refused.** A provider that does not confirm the address can
  neither create the administrator's account nor attach itself to it. Google
  always confirms. GitHub confirms an address that was verified on GitHub. For
  Microsoft, see [the Tenant field](#microsofts-tenant-field).
- **Exempt from the access rules.** The administrator keeps their password when
  single sign-on is the only way in, and the domain list does not apply to
  them.
- **Changing `ADMIN_EMAIL`.** The new address becomes administrator at its next
  sign-in, or at startup if its account already exists. The former
  administrator keeps the role, which is stored in the database: run
  [`admin:demote-others`](#server-commands) to take it away.
- There is no screen to make anyone else an administrator.

### Server commands

Two commands act on the administrator from the server. They use its
environment (`MONGODB_URI`, `BETTER_AUTH_SECRET`, `ADMIN_EMAIL`) and work
whether or not the server is running.

| Command | What it does | When |
|---|---|---|
| `admin:reset-password` | Gives the `ADMIN_EMAIL` account a new password and prints it once. It creates the account if there is none, gives it the admin role and a verified address, and signs out its sessions. | The administrator cannot sign in any more: single sign-on is down, there is no SMTP server for "Forgot password?", or the password is forgotten. |
| `admin:demote-others` | Leaves the `ADMIN_EMAIL` account as the only administrator. Every other account with the role loses it and is signed out, so the access rules apply to it from its next sign-in. Its API keys keep working. | After changing `ADMIN_EMAIL`, once the server runs with the new value. |

Run them like this, here with `admin:reset-password`:

```bash
# With Docker:
docker compose exec app npm run admin:reset-password --workspace=@imprime/backend

# Without Docker, from a build:
npm run admin:reset-password --workspace=@imprime/backend

# From the sources, without a build: add :dev
npm run admin:reset-password:dev --workspace=@imprime/backend
```

- There is no change-password screen yet. Replace the password that
  `admin:reset-password` prints with "Forgot password?" once email works.
- Before `admin:demote-others`, the new `ADMIN_EMAIL` does not need an
  account. If it has none, nobody is administrator until someone signs in with
  that address, and whoever does it first gets the role. The command says so.

## Email: Administration → Email

### SMTP server

| Field | Notes |
|---|---|
| Host, Port | The port is 587 by default. |
| TLS from the start | Port 465 needs it, and it is always on there. Leave it off for 587 or 25: the connection then switches to TLS (STARTTLS) when the server offers it. |
| User, Password | Optional: give both or neither. The password is never shown again. Leave the field empty to keep the stored one; changing the user drops it. |
| Sender | An address, optionally with a name: `Imprime <no-reply@example.com>`. |

- **Send test email** uses the form as it is filled in, saved or not. If it
  fails, it shows the SMTP server's own message.
- The server gets 10 seconds to answer. An unreachable server makes sign-ups
  and password resets fail quickly instead of hanging.
- Without an SMTP server, password reset is unavailable ("Forgot password?" is
  greyed out) and email verification cannot be turned on.
- While email verification is on, the SMTP server cannot be removed.

### Email verification

Turn it on with **Require users to verify their email address**. It needs an
SMTP server.

- A new password account is sent a link, valid for one hour, and cannot sign
  in until it follows it. Following the link signs the user in, except in
  *Single sign-on only* mode, where it only verifies the address.
- An existing account with an unverified address is refused at its next
  sign-in and sent a fresh link. The sign-in page then says "Check your inbox".
- It concerns password accounts only. Single sign-on accounts sign in on the
  provider's word. A new one whose address the provider did not confirm is sent
  a link, but it is not blocked meanwhile, unless the
  [domain list](#allowed-domains) requires a verified address.
- The administrator's address always counts as verified.

### Password reset

- The link is valid for 15 minutes.
- It works for any account, including one created through single sign-on. That
  account then has a password, and may sign in with it if the access policy
  allows.

## Single sign-on: Administration → Single sign-on

Each provider is an OAuth application that you register with the provider. Its
card shows the **Callback URL** to register there:
`PUBLIC_APP_URL` + `/api/auth/callback/<provider>`. You then paste back the
client ID and the client secret.

| Provider | Where to register | Who can sign in |
|---|---|---|
| Google | Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* of type "Web application". Add the callback URL as an authorized redirect URI. | Any Google account. To allow only your Google Workspace, make it an **Internal** app on the OAuth consent screen. |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps. Then generate a client secret. | Any GitHub account. Restrict it with the [domain list](#allowed-domains). |
| Microsoft | Microsoft Entra → App registrations. Add the callback URL as a **Web** redirect URI and a client secret under *Certificates & secrets*. The client ID is the *Application (client) ID*. | Depends on the Tenant field, below. |

### Microsoft's Tenant field

| Tenant | Accounts that can sign in | Addresses trusted |
|---|---|---|
| `common` (the default) | Work, school and personal Microsoft accounts | No |
| `organizations` | Work and school accounts, from any organisation | No |
| `consumers` | Personal Microsoft accounts | No |
| Your tenant ID or domain | Your organisation's accounts | Yes |

The tenant must match the app registration's *Supported account types*. In a
tenant shared by many organisations, anyone can put any address on an account,
and Microsoft does not confirm it. In your own tenant, your administrators
manage the addresses, so Imprime trusts them. An untrusted address can never be
attached to an existing account, and the domain list refuses it.

### Card status and secrets

- Each card shows one of three statuses:
  - **Not configured**.
  - **Active**: the provider is offered on the sign-in page.
  - **Secret unreadable**: the stored secret was encrypted with a former
    `BETTER_AUTH_SECRET`. The provider leaves the sign-in page until you enter
    the secret again.
- The client secret is never shown again. Leave the field empty to keep it,
  unless you change the client ID.

### Accounts and single sign-on

- The first sign-in with a provider creates the account, if the Access settings
  allow its address.
- A provider's account can have the same address as an existing account. It is
  attached to that account only if the provider confirms the address **and**
  the existing account's address is verified. Otherwise the sign-in page says
  "An account already uses this address: sign in the way you created it."
  The usual case is a password account created while email verification was
  off. Turn verification on: at its next password sign-in, the account is sent
  a link. Once its address is verified, the provider can be attached.
- Removing a provider takes effect at once. Users who only signed in with it
  can get a password with "Forgot password?" (this needs an SMTP server), or
  sign in with another provider that confirms the same address.
- In *Single sign-on only* mode, removing the last provider leaves only the
  administrator able to sign in. The page warns you, but does not stop you.

## Access: Administration → Access

### Email and password

| | Anyone can sign up | No new password accounts | Single sign-on only |
|---|---|---|---|
| Sign up with a password | Yes | No | No |
| Sign in with a password | Yes | Yes | Administrator only |
| Sign up or sign in with a provider | Yes | Yes | Yes |
| The sign-in page shows | *Sign in* and *Sign up* tabs, and the providers | The sign-in form, and the providers | The providers, and an "Administrator sign-in" link |

- With *No new password accounts*, an account created through single sign-on
  can still get a password with "Forgot password?", and then use it.
- With *Single sign-on only*, a non-administrator who types the right password
  is told to sign in with their organisation's account. The password is checked
  first, so the refusal reveals nothing to someone who does not know it; a
  wrong password gets the usual error.
- *Single sign-on only* without an active provider leaves only the
  administrator able to sign in. The page warns about it, and the sign-in page
  then shows the password form directly.

### Allowed domains

- Only addresses in the listed domains may have an account. Domains match
  exactly: `example.com` does not admit `eu.example.com`, so list each one. You
  can list up to 100. An empty list admits any domain.
- The list is checked when an account is created, by any means, and at every
  sign-in, so existing accounts outside the list are shut out too.
- The address must be verified:
  - by the provider: Google, GitHub for addresses verified on GitHub, and
    Microsoft in your own tenant;
  - or by email.

  Password accounts therefore need email verification turned on. Otherwise they
  are refused ("Your address must be verified before you can sign in"), which
  the page warns about.
- The administrator is exempt.
- GitHub has no other restriction: the domain list is what limits GitHub
  sign-in to your organisation.

### Who is signed out when you save

A session lasts 7 days and is extended while it is used, so new rules would
otherwise reach users only at their next sign-in. Saving therefore signs out:

- everyone but the administrator, when *Single sign-on only* is turned on;
- the users outside the domains, or with an unverified address, when the domain
  list changes.

Loosening the rules signs nobody out. The page asks for confirmation before it
signs anyone out. API keys and MCP tokens are not affected: see [Limits](#limits).

## Recipes

| Situation | Single sign-on | Access |
|---|---|---|
| Open instance (the default) | Optional | Anyone can sign up, no domains |
| Company on Google Workspace | Google, from an **Internal** app | Single sign-on only, plus your domain |
| Company on Microsoft 365 | Microsoft, with your tenant ID | Single sign-on only. The tenant already restricts; the domain list is optional |
| Company on GitHub | GitHub | Single sign-on only, plus your domain. Members need that address verified on GitHub |
| Closed instance: existing accounts only | None | No new password accounts |

## What users see

| Message on the sign-in page | Cause |
|---|---|
| Check your inbox | Email verification is on and the address is not verified: a link was just sent |
| This address is not allowed on this instance… | The address is outside the domain list |
| Your address must be verified before you can sign in… | Domain list on, address not verified |
| Sign in with your organisation's account: passwords are for administrators. | *Single sign-on only* mode |
| An account already uses this address: sign in the way you created it. | The provider's account could not be attached: see [Accounts and single sign-on](#accounts-and-single-sign-on) |
| Sign-in failed. Try again, or ask your administrator. | Any other failure from a provider. The page only shows messages it knows, since anyone can craft a link to it |

## Limits

- **API keys** keep working whatever the access rules, even for a user who is
  shut out: they are not sessions. There is no screen yet for an administrator
  to revoke another user's keys.
- **MCP OAuth tokens** keep working until they expire: one hour, renewable for
  up to 7 days.
- **Several backend processes.** Settings take effect in the process that saved
  them. Restart the other processes.
- **Rate limits.** In production, better-auth allows, per client address:
  - 3 sign-in or sign-up attempts every 10 seconds;
  - 3 reset or verification emails per minute.

  The server also allows 20 requests every 15 minutes per address on all of
  `/api/auth`, including the session checks the app makes when a page loads or
  the tab regains focus. This limit applies in every environment. It keys on
  the connection's address and ignores `X-Forwarded-For`: behind a reverse
  proxy, every user shares it.
- **Development.** Emailed links and SSO callbacks go to
  `PUBLIC_APP_URL/api/auth/…`, and the Vite dev server does not forward `/api`
  to the backend. Test them against a build that the backend serves.
- There is no change-password screen and no user-management screen yet.

### MongoDB must be a replica set

Account creation runs in a transaction, and MongoDB only allows transactions on
a replica set. Atlas is one. A single `mongod` must run as a one-member replica
set: start it with `--replSet rs0`, then run `rs.initiate()` once. Otherwise
every sign-up fails with
"Transaction numbers are only allowed on a replica set member or mongos".

### Changing the secret

- Everyone is signed out, because session cookies were signed with the former
  secret.
- The stored SMTP password and SSO client secrets can no longer be read:
  - Imprime uses the SMTP server without its password, so emails fail until you
    enter it again. The startup log says so.
  - The providers show **Secret unreadable** and leave the sign-in page until
    you enter their secrets again.
- To change the secret without entering them again, set
  `BETTER_AUTH_SECRETS=1:<new secret>` and keep the former value in
  `BETTER_AUTH_SECRET`. What was encrypted with the former secret stays
  readable, and new values use the new one. Everyone is still signed out.
