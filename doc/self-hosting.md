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
- Memory: about 110 to 160 MB at rest for the app, plus 150 to 200 MB for
  each PDF being drawn, kept for a minute after the last one, and about
  160 MB for MongoDB when it runs beside it. `MAX_PDF_RENDERS` bounds how many
  PDFs are drawn at once (4 by default): on 1 GB, set it to 2. Each render
  takes a CPU core while it runs. Nothing is built on the server: the image
  is pulled ready-made.

## Two ways to run it

| File | Runs | For |
|---|---|---|
| [`docker-compose.yml`](../docker-compose.yml) | the app **and its MongoDB**, its data in a Docker volume | starting from nothing |
| [`docker-compose.external-mongodb.yml`](../docker-compose.external-mongodb.yml) | the app alone, on **your MongoDB** | Atlas, a database server elsewhere, a database your hosting provides |

Either takes the same `.env`; the second also requires `MONGODB_URI`. A
replica set (Atlas is one) or a single MongoDB server both work: see
[MongoDB](./authentication.md#mongodb-a-replica-set-or-a-single-server).

## With Docker Compose

1. In an empty folder, put one of the two files above and a `.env` made from
   [`.env.example`](../.env.example). Compose refuses to start without the
   required values:

   ```bash
   PUBLIC_APP_URL=https://imprime.example.com   # the address users open
   BETTER_AUTH_SECRET=...                       # openssl rand -base64 32
   # with docker-compose.external-mongodb.yml only:
   MONGODB_URI=mongodb+srv://user:password@cluster.example.net/imprime
   ```

2. Start it:

   ```bash
   docker compose up -d                                             # app + MongoDB
   docker compose -f docker-compose.external-mongodb.yml up -d     # app alone
   ```

   With the second file, every `docker compose` command below takes the same
   `-f docker-compose.external-mongodb.yml` — or set
   `COMPOSE_FILE=docker-compose.external-mongodb.yml` in `.env` once.

   The app listens on `127.0.0.1:3023` — this machine only. Point the reverse
   proxy at it; `TRUST_PROXY` is `1` by default, for that one proxy. To reach
   the app from elsewhere without a proxy, remove `127.0.0.1:` from the
   `ports` line **and** set `TRUST_PROXY=` empty in `.env`: otherwise anyone
   could choose the address the sign-in rate limits count.

3. [Create the administrator](#the-administrator).

### Ports, and several instances on one machine

`PORT` (3023 by default) is the app's port, in its container and on
`127.0.0.1`: the one the reverse proxy points at. It is the only port
published on the machine — the only one two instances could fight over.

The MongoDB of `docker-compose.yml` is published on no port: only the app
reaches it, on the network Compose makes for the stack. Several stacks on one
machine — two Imprime instances, or other apps with their own MongoDB — each
get their own network and their own volume, named after the stack's folder,
and never see each other. Run each from its own folder, with its own `.env`
and its own `PORT`.

With your own MongoDB, its port is part of `MONGODB_URI`. One on the same
machine but outside Docker is `mongodb://host.docker.internal:27017/imprime`
from the container; it must listen on more than `127.0.0.1` (its `bindIp`)
for the container to reach it.

## Coolify

1. **New resource → Docker Compose Empty**, and paste one of the two files.
   (Or deploy this repository with the *Docker Compose* build pack, and give
   it the file's path.)
2. On the **app** service, set the domain with the app's port — `PORT`,
   3023 by default: `https://imprime.example.com:3023`. Coolify's proxy reaches the app over
   its Docker network; the `127.0.0.1` port binding does not get in its way,
   and is not reachable from outside.
3. In **Environment variables**, fill in `PUBLIC_APP_URL` (that same address,
   without the port) and `BETTER_AUTH_SECRET` — and `MONGODB_URI` with the
   external file. Leave
   `TRUST_PROXY` empty — `1`, for Coolify's proxy — unless another proxy
   stands in front of it, such as Cloudflare's: then `2`.
4. Deploy, then [create the administrator](#the-administrator).

## The administrator

**The first account created on a new instance is its administrator.** Open
the app right after the first start: with no account yet, the sign-in page
offers only *Create the administrator account*. Do it at once — until then,
whoever opens the address first gets the role; the server's log says so at
every start while no account exists.

The administrator manages the instance from **Administration** in the app:
email, single sign-on, who may sign up, fonts.

After that, whoever runs the server gives or takes the role by address — the
account must exist, so its owner signs up first:

```bash
docker compose exec app npm run admin grant you@example.com
docker compose exec app npm run admin demote someone@example.com
docker compose exec app npm run admin reset-password you@example.com
```

In a terminal already inside the app's container — Coolify's **Terminal** on
the app service — it is just `npm run admin grant you@example.com`. More in
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

Everything — accounts, templates, images, fonts — is in MongoDB: the app
container holds nothing. On your own MongoDB, back it up as you back up that
server. With `docker-compose.yml`, the data is in the `mongodb-data` volume;
to save it:

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
