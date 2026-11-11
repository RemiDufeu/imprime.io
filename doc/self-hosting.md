# Self-hosting

Imprime runs as one container — the API, serving the editor on the same
address — beside a MongoDB. The image is published at
`ghcr.io/remidufeu/imprime`, for amd64 and arm64: nothing needs to be cloned or
built.

> **Imprime is not in production yet.** An update may change how data is
> stored with nothing to carry the old data over, and the database may then
> need to be emptied. Pin an image (see [Updating](#updating)) and update when
> you choose.

## What you need

- Docker with Compose, or [Coolify](#coolify).
- A domain, and a reverse proxy serving it in HTTPS: Coolify's, Caddy, nginx,
  Traefik. Session cookies are only marked `Secure` behind `https://`.
- Memory: about 270 MB at rest — 100 to 160 MB for the app, 160 MB for
  MongoDB — plus 150 to 200 MB for each PDF being drawn, kept for a minute
  after the last one. `MAX_PDF_RENDERS` bounds how many run at once (4 by
  default): on 1 GB, set it to 2. Each render takes a CPU core while it runs.
  Nothing is built on the server: the image is pulled ready-made.

## With Docker Compose

1. In an empty folder, put [`docker-compose.yml`](../docker-compose.yml) and a
   `.env` made from [`.env.example`](../.env.example). Two values are required,
   and Compose refuses to start without them:

   ```bash
   PUBLIC_APP_URL=https://imprime.example.com   # the address users open
   BETTER_AUTH_SECRET=...                       # openssl rand -base64 32
   ADMIN_EMAIL=you@example.com                  # the administrator's address
   ```

2. Start it:

   ```bash
   docker compose up -d
   ```

   The app listens on `127.0.0.1:3023` — this machine only. Point the reverse
   proxy at it; `TRUST_PROXY` is `1` by default, for that one proxy. To reach
   the app from elsewhere without a proxy, remove `127.0.0.1:` from the
   `ports` line **and** set `TRUST_PROXY=` empty in `.env`: otherwise anyone
   could choose the address the sign-in rate limits count.

3. [Create the administrator](#the-administrator).

### Already have a MongoDB

Delete the `mongodb` service, the app's `depends_on` and the `volumes` section
from `docker-compose.yml`, and set `MONGODB_URI` in `.env`. A replica set (Atlas
is one) or a single server both work: see
[MongoDB](./authentication.md#mongodb-a-replica-set-or-a-single-server).

## Coolify

1. **New resource → Docker Compose Empty**, and paste
   [`docker-compose.yml`](../docker-compose.yml). (Or deploy this repository with
   the *Docker Compose* build pack: Coolify reads the same file.)
2. On the **app** service, set the domain with the container's port:
   `https://imprime.example.com:3023`. Coolify's proxy reaches the app over
   its Docker network; the `127.0.0.1` port binding does not get in its way,
   and is not reachable from outside.
3. In **Environment variables**, fill in `PUBLIC_APP_URL` (that same address,
   without the port), `BETTER_AUTH_SECRET` and `ADMIN_EMAIL`. Leave
   `TRUST_PROXY` empty — `1`, for Coolify's proxy — unless another proxy
   stands in front of it, such as Cloudflare's: then `2`.
4. Deploy, then [create the administrator](#the-administrator) from the app
   container's **Terminal** in Coolify.

## The administrator

The account with `ADMIN_EMAIL` manages the instance from **Administration** in
the app: email, single sign-on, who may sign up, fonts. Create it once the
server runs — this prints its password:

```bash
docker compose exec app npm run admin:reset-password --workspace=@imprime/backend
```

The same command gives it a new password if it is ever locked out. More in
[Authentication and access](./authentication.md).

## Updating

`latest` follows the main branch. Every build is also tagged by its commit,
`sha-abc1234`, and releases by their version, `1.2.3`: to update only when you
decide, set the image in `.env`:

```bash
IMPRIME_IMAGE=ghcr.io/remidufeu/imprime:sha-abc1234
```

then `docker compose pull && docker compose up -d`.

## Backups

Everything — accounts, templates, images, fonts — is in MongoDB, in the
`mongodb-data` volume. The app container holds nothing. To save the database:

```bash
docker compose exec -T mongodb mongodump --archive > imprime.archive
```

and to restore it: `docker compose exec -T mongodb mongorestore --archive < imprime.archive`.

## PDF rendering

Each PDF is drawn on a worker thread of its own, stopped when it outlasts its
timeout. Past the number that may run at once, an export waits its turn for
a few seconds, then is refused with `429 EXPORT_BUSY`. All of it is set in
`.env` — `MAX_PDF_RENDERS`, `MAX_PDF_RENDERS_PER_USER`,
`PDF_RENDER_TIMEOUT_SECONDS`, `PDF_QUEUE_SIZE`, `PDF_QUEUE_WAIT_SECONDS`: see
[`.env.example`](../.env.example).

## Building the image yourself

From a clone of this repository:

```bash
npm run docker:build        # tags it imprime-app
```

and set `IMPRIME_IMAGE=imprime-app` in `.env`.
