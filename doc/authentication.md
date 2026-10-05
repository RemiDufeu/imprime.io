# Authentication and access

This page is for whoever deploys and administers an Imprime instance. It covers
every way into Imprime, where each one is configured, and the behaviours that
are easy to miss.

## Ways in

| Way in | For | Set up in | Good to know |
|---|---|---|---|
| Email and password | People, in the browser | Always available; who may use it: **Administration → Access** | Password reset and email verification need an SMTP server |
| Single sign-on: Google, GitHub, Microsoft | People, in the browser | **Administration → Single sign-on** | The first sign-in creates the account |
| API key | Scripts, the SDK, headless MCP clients | Each user, in **Settings → API Keys** | Sent in the `x-api-key` header. The domain list applies to it, the password policy does not |
| MCP OAuth | Interactive AI clients, such as the Claude connector | Nothing to set up | The user signs in on the usual sign-in page and allows the client on a consent page, then the client holds a token. See [MCP clients](#mcp-clients) |

## Where things are configured

| Setting | Where | Takes effect |
|---|---|---|
| `BETTER_AUTH_SECRET`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `MONGODB_URI`, `TRUST_PROXY` | Environment (`.env`, `docker-compose.yml`) | At startup |
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
| `PUBLIC_APP_URL` | Required in production: the server refuses to start without it. The address users open, e.g. `https://imprime.example.com`. SSO callback URLs and the links in emails are built from it. Without it they would be built from each request's `Host` header, which anyone can forge to have a reset link point at their own site. Use `https://`: with `http://`, session cookies lose the `Secure` flag, and the log warns about it. |
| `CORS_ORIGIN` | Origins allowed to call the API, comma-separated. `*` is refused in production. |
| `ADMIN_EMAIL` | The administrator's address: see [The administrator](#the-administrator). |
| `MONGODB_URI` | Where accounts, sessions and settings live. It must be a replica set: see [MongoDB](#mongodb-must-be-a-replica-set). |
| `TRUST_PROXY` | The reverse proxies in front of the server: how many (`1` behind a single nginx, Traefik or load balancer), or their addresses (`loopback`, `10.0.0.0/8`). The client's address, which the rate limits key on, is then read from `X-Forwarded-For` past them. Leave it unset when clients connect to the server directly: the header is then ignored, since anyone can write it. `true` is refused for the same reason. |

## Setting up a new instance

1. Set the environment variables above. `ADMIN_EMAIL` is the address you will
   sign in with. It can be the address of your Google account if you plan to
   sign in with Google.
2. Start the server. The log says
   `admin@example.com has no account yet: create it with npm run admin:reset-password…`
3. On the server, run [`admin:reset-password`](#server-commands). It creates
   the account and prints its password once. Sign in with it: you are the
   administrator, and **Administration** appears in the avatar menu.
4. In **Administration → Email**, enter the SMTP server, click
   **Send test email**, then save. Turn on email verification if you want it.
   Then replace the printed password with "Forgot password?".
5. In **Administration → Single sign-on**, register the providers you want.
6. In **Administration → Access**, choose who may use a password, and from
   which domains.

Nobody can claim the administrator's address from the sign-in page: signing
up with it is refused, and only the server command or a provider that vouches
for the address can create its account.

## The administrator

An instance has one configured administrator: the account whose address is
`ADMIN_EMAIL`.

- **Promoted once verified.** The account with that address is given the
  admin role at every sign-in, with a password or through single sign-on, and
  at every startup, provided its address is verified. An unverified one is
  only someone's claim to the address and is never promoted; the startup log
  says so, and `admin:reset-password` claims it.
- **Created by the server or by a provider.** `admin:reset-password` creates
  the account with a verified address, because the operator vouches for it.
  A provider that confirms the address can create it too. Signing up with a
  password is refused: "This address is the administrator's…".
- **Through single sign-on.** `ADMIN_EMAIL` can be the address of a Google,
  GitHub or Microsoft account. If the account was created by the server
  command first, a later sign-in with the provider lands on the same account.
- **Claims are refused.** A provider that does not confirm the address can
  neither create the administrator's account nor attach itself to it. Google
  always confirms. GitHub confirms an address that was verified on GitHub. For
  Microsoft, see [Verified addresses](#verified-addresses-xms_edov).
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
| `admin:reset-password` | Gives the `ADMIN_EMAIL` account a new password and prints it once. It creates the account if there is none, gives it the admin role and a verified address, and revokes everything else that opened it: sessions, API keys and MCP tokens. | Setting up a new instance. The administrator cannot sign in any more: single sign-on is down, there is no SMTP server for "Forgot password?", or the password is forgotten. Someone else may have had access to the account. |
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
  account. If it has none, or its address is unverified, nobody is
  administrator until `admin:reset-password` runs, or the address signs in
  through a provider that confirms it. The command says so.

## Email: Administration → Email

### SMTP server

| Field | Notes |
|---|---|
| Host, Port | The port is 587 by default. |
| TLS from the start | Port 465 needs it, and it is always on there. Leave it off for 587 or 25: the connection then switches to TLS (STARTTLS) when the server offers it. With a user and password it must: a server that does not offer STARTTLS gets no email rather than the password in clear. |
| User, Password | Optional: give both or neither. The password is never shown again. Leave the field empty to keep the stored one; changing the host, the port or the user drops it, so that it is never sent to another server. |
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
- Turning it on signs out the users whose address is unverified. At their
  next sign-in they are refused and sent a fresh link. The sign-in page then
  says "Check your inbox".
- Following a link revokes everything that opened the account before: its
  other sessions, its API keys, its MCP tokens. Until then, the account was
  whoever's typed the address at sign-up, perhaps not its owner. Users who
  made API keys while verification was off make them again.
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
- A new password signs out every session of the account.
- Following the link proves the address, as a verification link does: an
  unverified address becomes verified, and the account's API keys and MCP
  tokens are revoked with its sessions.

## Single sign-on: Administration → Single sign-on

Each provider is an OAuth application that you register with the provider. Its
card shows the **Callback URL** to register there:
`PUBLIC_APP_URL` + `/api/auth/callback/<provider>`. You then paste back the
client ID and the client secret.

| Provider | Where to register | Who can sign in |
|---|---|---|
| Google | Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* of type "Web application". Add the callback URL as an authorized redirect URI. | Any Google account. To allow only your Google Workspace, make it an **Internal** app on the OAuth consent screen. |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps. Then generate a client secret. | Any GitHub account. Restrict it with the [domain list](#allowed-domains). |
| Microsoft | Microsoft Entra → App registrations. Add the callback URL as a **Web** redirect URI and a client secret under *Certificates & secrets*. The client ID is the *Application (client) ID*. Under *Token configuration*, add the optional claims `email` and `xms_edov` to the ID token: see [Verified addresses](#verified-addresses-xms_edov). | Depends on the Tenant field, below. |

### Microsoft's Tenant field

| Tenant | Accounts that can sign in |
|---|---|
| `common` (the default) | Work, school and personal Microsoft accounts |
| `organizations` | Work and school accounts, from any organisation |
| `consumers` | Personal Microsoft accounts |
| Your tenant ID or domain | Your organisation's accounts, and its guests |

The tenant must match the app registration's *Supported account types*.

### Verified addresses (xms_edov)

The address Microsoft gives for an account is its `email` claim, which comes
from the `mail` attribute of the account in its directory. Microsoft does not
check it: a tenant's administrators can set it to any address, in any tenant,
including yours. Trusting it would let whoever can write it sign in as the
existing account with that address, the administrator's included. This is the
attack known as nOAuth.

Microsoft's answer is the optional claim `xms_edov` ("email domain owner
verified"). It is true only when the address's domain is verified by the
tenant the account lives in, or when Microsoft checked the mailbox itself
(personal accounts). An address counts as verified in Imprime only when
`xms_edov` is true, whatever the Tenant field. Without the claim, no Microsoft
address is verified. The account can still sign in on an open instance, but:

- it cannot be attached to an existing account with the same address;
- it cannot create the administrator's account;
- the domain list refuses it.

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
    Microsoft when it sends [`xms_edov`](#verified-addresses-xms_edov);
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
signs anyone out. API keys and MCP tokens are checked against the domain list
each time they are used, so they stop working for the users it shuts out, and
work again if the list lets them back in. *Single sign-on only* does not affect
them: they are not passwords.

## MCP clients

An AI client registers itself with Imprime, then sends the user to sign in.
Registration is open to anyone, without an account, because MCP clients do it
themselves. A client's name is therefore whatever its author chose.

- **Consent every time.** Before a client gets access, the user sees a consent
  page with the client's name and **where the access goes**: the address of
  its redirect URI, such as `https://claude.ai`. That address is the one to
  check, since the name can be anything. A link that would hand over access
  without that page does not exist.
- **What a client can do.** Read the user's templates and export them to
  PDF. With `offline_access`, for up to 7 days.
- **Every request is checked.** A client's session lasts as long as its token
  or API key: revoking the key, or the token expiring, ends it. A user can
  have at most 10 sessions open; opening another closes the oldest.

## Recipes

| Situation | Single sign-on | Access |
|---|---|---|
| Open instance (the default) | Optional | Anyone can sign up, no domains |
| Company on Google Workspace | Google, from an **Internal** app | Single sign-on only, plus your domain |
| Company on Microsoft 365 | Microsoft, with your tenant ID and the `xms_edov` claim | Single sign-on only. The tenant already restricts; the domain list is optional |
| Company on GitHub | GitHub | Single sign-on only, plus your domain. Members need that address verified on GitHub |
| Closed instance: existing accounts only | None | No new password accounts |

## What users see

| Message on the sign-in page | Cause |
|---|---|
| Check your inbox | Email verification is on and the address is not verified: a link was just sent |
| This address is not allowed on this instance… | The address is outside the domain list |
| Your address must be verified before you can sign in… | Domain list on, address not verified |
| Sign in with your organisation's account: passwords are for administrators. | *Single sign-on only* mode |
| This address is the administrator's: its account is created on the server, or through single sign-on. | Someone signed up with `ADMIN_EMAIL`: see [The administrator](#the-administrator) |
| An account already uses this address: sign in the way you created it. | The provider's account could not be attached: see [Accounts and single sign-on](#accounts-and-single-sign-on) |
| Sign-in failed. Try again, or ask your administrator. | Any other failure from a provider. The page only shows messages it knows, since anyone can craft a link to it |

## Limits

- **API keys and MCP OAuth tokens** obey the domain list and a ban (through
  the API: `POST /api/auth/admin/ban-user`), not the password policy. There is no screen yet for an administrator to revoke another
  user's keys. An MCP token lasts one hour, renewable for up to 7 days.
- **Several backend processes.** Settings take effect in the process that saved
  them. Restart the other processes.
- **Rate limits.** In production, better-auth allows, per client address:
  - 3 sign-in or sign-up attempts every 10 seconds;
  - 3 reset or verification emails per minute.

  The server also allows 20 requests every 15 minutes per address on
  `/api/auth`, in every environment. The session checks the app makes when a
  page loads or the tab regains focus do not count. The client's address is
  the connection's, unless [`TRUST_PROXY`](#environment-variables) says which
  proxies to read `X-Forwarded-For` past. Behind a reverse proxy without it,
  every user shares the proxy's address, and so the limits.
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
