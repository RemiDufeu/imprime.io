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
| `BETTER_AUTH_SECRET`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `MONGODB_URI`, `TRUST_PROXY` | Environment (`.env`, `docker-compose.yml`) | At startup |
| SMTP server, email verification | **Administration → Email** | At once |
| Google, GitHub, Microsoft | **Administration → Single sign-on** | At once |
| Password policy, allowed domains | **Administration → Access** | At once |
| API keys | **Settings → API Keys** | At once |
| The first administrator | The first account created on the instance | At its sign-up |
| Giving or taking the admin role | `npm run admin grant <email>` / `npm run admin demote <email>`, on the server | At once |
| A password, when locked out | `npm run admin reset-password <email>`, on the server | At once |

The Administration pages are also available through the API, with an
administrator's API key: see *Settings Methods* in the
[SDK README](../packages/sdk/README.md).

### Environment variables

| Variable | Role |
|---|---|
| `BETTER_AUTH_SECRET` | Required: production refuses to start without it. It signs session cookies and encrypts the SMTP password and the SSO client secrets stored in the database. Generate one with `openssl rand -base64 32`. See [Changing the secret](#changing-the-secret) before you change it. |
| `PUBLIC_APP_URL` | Required in production: the server refuses to start without it. The address users open, e.g. `https://imprime.example.com`. SSO callback URLs and the links in emails are built from it. Without it they would be built from each request's `Host` header, which anyone can forge to have a reset link point at their own site. Use `https://`: with `http://`, session cookies lose the `Secure` flag, and the log warns about it. |
| `CORS_ORIGIN` | Other origins allowed to call the API with a session, comma-separated. Unset: the app's own, `PUBLIC_APP_URL`. `*` is refused in production. |
| `MONGODB_URI` | Where accounts, sessions and settings live. A replica set or a single server: see [MongoDB](#mongodb-a-replica-set-or-a-single-server). |
| `TRUST_PROXY` | The reverse proxies in front of the server: how many (`1` behind a single nginx, Traefik or load balancer), or their addresses (`loopback`, `10.0.0.0/8`). The client's address, which the rate limits key on, is then read from `X-Forwarded-For` past them. Leave it unset when clients connect to the server directly: the header is then ignored, since anyone can write it. `true` is refused for the same reason. |

## Setting up a new instance

1. Set the environment variables above, and start the server. While the
   instance has no account, its log says
   `No account yet: the first to sign up at https://… becomes the administrator.`
2. Open the app at once. With no account yet, the sign-in page offers only
   **Create the administrator account**: create yours. You are the
   administrator, and **Administration** appears in the avatar menu.
3. In **Administration → Email**, enter the SMTP server, click
   **Send test email**, then save. Turn on email verification if you want it.
4. In **Administration → Single sign-on**, register the providers you want.
5. In **Administration → Access**, choose who may use a password, and from
   which domains.

Until the first account exists, whoever opens the address first becomes the
administrator: create it right after the first start, or keep the instance
unreachable until you have.

## The administrator

- **The first account is the administrator.** The account that signs up on an
  instance without any is given the admin role, and nobody else is. If two
  sign up at the same instant on a new instance, neither is: give the role
  with `npm run admin grant`.
- **After that, the role is given and taken on the server**, by address — see
  [Server commands](#server-commands). Any number of accounts can have it.
- **Exempt from the access rules.** An administrator keeps their password when
  single sign-on is the only way in, and the domain list does not apply to
  them.
- There is no screen to make anyone else an administrator.

### Server commands

```bash
npm run admin grant you@example.com            # gives the role
npm run admin demote someone@example.com       # takes it, and signs the account out
npm run admin reset-password you@example.com   # a new password, printed once
```

They use the server's environment (`MONGODB_URI`, `BETTER_AUTH_SECRET`) and
work whether or not the server is running. The account must exist: its owner
signs up first.

- `demote` signs the account out, so the access rules apply to it from its
  next sign-in; its API keys keep working, as a user's. It says when no
  administrator is left — `grant` gives the role back.
- `reset-password` is the way back in without email: a forgotten password,
  single sign-on down. It prints a new password once, marks the address
  verified — whoever runs the server vouches for it — and revokes everything
  else that opened the account: sessions, API keys, MCP tokens, in case
  someone else had access. An account made through single sign-on gets a
  password too. Replace the printed one with "Forgot password?" once email
  works.

Where to run them:

```bash
# With Docker Compose:
docker compose exec app npm run admin grant you@example.com

# In a terminal inside the app's container (Coolify's Terminal), or from a build:
npm run admin grant you@example.com

# From the sources, without a build:
npm run admin:dev --workspace=@imprime/backend -- grant you@example.com
```

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
- Administrators are not signed out when it is turned on. One whose address
  is unverified — the first account of an instance without email, say — is
  sent a link at their next sign-in, like anyone: send yourself the test
  email before turning it on.

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
| Create the administrator account | The instance has no account yet: see [The administrator](#the-administrator) |
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

### MongoDB: a replica set, or a single server

Either works. At startup the server asks MongoDB what it is:

- **A replica set** (Atlas is one) or a sharded cluster: account changes — a
  sign-up writes the user, then their credentials — run in transactions, all
  or nothing.
- **A single `mongod`**: MongoDB refuses transactions there, so they are left
  off, and the log says so at startup. Everything works; the only difference
  is that a failure between two writes of a sign-up — the database stopping
  at that instant — can leave an account half made, whose address then cannot
  sign up again until it is removed.

To have transactions on a single server, run it as a one-member replica set:
start `mongod` with `--replSet rs0`, run `rs.initiate()` once, and add
`?replicaSet=rs0` to `MONGODB_URI`. Nothing else changes.

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
