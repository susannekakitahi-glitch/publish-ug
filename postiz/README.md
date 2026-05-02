# Hosting Postiz on Render

Posta talks to a self-hosted [Postiz](https://github.com/gitroomhq/postiz-app)
instance instead of Zernio. This directory holds the deploy recipe.

The actual blueprint lives at the repo root (`render.yaml`) so Render's
"New Blueprint" flow finds it automatically. This README is the human
checklist for first-time setup.

---

## Cost summary

| Service | Plan | Monthly |
|---|---|---|
| posta-backend (FastAPI proxy, existing) | free | $0 |
| posta-postiz (web, Docker image) | starter | $7 |
| posta-postiz-temporal (private service) | starter | $7 |
| postiz-postgres | basic-256mb | $7 |
| postiz-temporal-db | basic-256mb | $7 |
| postiz-redis (key value) | free | $0 |
| **Total** | | **~$28/mo** |

vs Zernio's $833/mo Unlimited tier. Migrate to Oracle Cloud Always Free
later (see "Future migration" at the bottom) once a virtual card works
to drop hosting to $0/mo.

---

## One-time setup

### 1. Apply the Blueprint

1. Sign in at https://dashboard.render.com (the account that already
   hosts `posta-backend`).
2. Click **New +** -> **Blueprint**.
3. Pick `susannekakitahi-glitch/publish-ug` and select the branch that
   contains the updated `render.yaml` (i.e. the PR for this change, or
   `main` after merge).
4. Render parses the YAML and shows the services it will create. Confirm.
5. Render starts provisioning. The two databases come up first
   (~3–5 min), then Redis, Temporal, and Postiz (Postiz takes ~10 min
   on first boot — Prisma schema migration runs on startup).

### 2. Set secrets in the Render dashboard

For every env var marked `sync: false`, Render shows a yellow
"Required" badge until you fill it in. Open each service -> Environment
tab -> set the value. **Save** after each one — saving redeploys the
service.

#### posta-postiz (web service)

| Var | Value |
|---|---|
| `MAIN_URL` | `https://posta-postiz.onrender.com` (auto-assigned URL — copy from the service's Settings tab) |
| `FRONTEND_URL` | same as `MAIN_URL` |
| `NEXT_PUBLIC_BACKEND_URL` | `MAIN_URL` + `/api` (e.g. `https://posta-postiz.onrender.com/api`) |
| `FACEBOOK_APP_ID` | leave blank for now (set in step 4) |
| `FACEBOOK_APP_SECRET` | leave blank for now |
| `X_API_KEY`, `X_API_SECRET`, etc. | leave blank — only set credentials for platforms you want to support |
| `CLOUDFLARE_*` | leave blank for now (set in step 5 if you choose R2) |

Other services (`posta-backend`, `posta-postiz-temporal`, the databases,
Redis) don't need any secret input from you — Render wires them
together via the YAML.

### 3. Register the Postiz admin user

1. Open the Postiz URL (e.g. `https://posta-postiz.onrender.com`) in a
   browser.
2. **Sign Up** with an email + password. Pick a strong password — this
   account has admin powers on the instance.
3. After login, open **Settings** -> **Public API**.
4. Copy the API key.
5. Tell Devin the API key (Devin will request it via the Secrets tool —
   provide as `POSTIZ_API_KEY`, scope: org or repo).
6. Once Devin confirms migration code uses Postiz, flip
   `DISABLE_REGISTRATION` to `true` in posta-postiz Environment so
   strangers can't register on your instance.

### 4. Register the Posta-Postiz Meta app (Facebook + Instagram)

You need your own Facebook app so Postiz can OAuth users into FB/IG
Pages on Posta's behalf. Zernio gave you theirs; now we run our own.

1. Go to https://developers.facebook.com -> **My Apps** -> **Create
   App**.
2. **Use case**: pick **Other**.
3. **App type**: **Business**.
4. **Display name**: `Posta` (or whatever).
5. **Contact email**: yours.
6. After creation, in the left sidebar:
   - Add product **Facebook Login for Business**.
   - Add product **Instagram** (Graph API).
7. **Settings** -> **Basic** -> copy **App ID** and **App Secret**
   (click "Show").
8. **Facebook Login for Business** -> **Settings** -> **Valid OAuth
   Redirect URIs**: add
   `https://posta-postiz.onrender.com/integrations/social/facebook`.
9. Back in Render, set in posta-postiz:
   - `FACEBOOK_APP_ID` = the App ID
   - `FACEBOOK_APP_SECRET` = the App Secret
   Save (redeploys).

For other platforms (X, LinkedIn, YouTube, TikTok, Threads) repeat the
pattern: register an app on each platform's developer portal, paste the
client id + secret into the matching env vars in Render.

> Skip platforms you don't need yet. Postiz lets users connect ONLY the
> platforms whose credentials are configured.

### 5. (Optional) Cloudflare R2 for media storage

Render web service filesystems are ephemeral — uploaded photos/videos
get wiped on every redeploy. Two ways to fix:

**Option A — Cloudflare R2 (recommended; ~$0/mo for first 10 GB)**

1. https://dash.cloudflare.com -> **R2** -> **Create bucket**
   -> name: `posta-postiz-media`.
2. **Manage R2 API Tokens** -> **Create API token** -> permission:
   "Object Read & Write" -> bucket: the one you just made.
3. Copy the Access Key ID + Secret Access Key + Account ID.
4. In bucket Settings, under "Public access", connect a custom domain
   or enable the `r2.dev` public URL. Copy the public URL.
5. In Render -> posta-postiz -> Environment, set:
   - `CLOUDFLARE_ACCOUNT_ID` = your Cloudflare account id (top-right of dashboard)
   - `CLOUDFLARE_ACCESS_KEY` = the Access Key ID
   - `CLOUDFLARE_SECRET_ACCESS_KEY` = the Secret
   - `CLOUDFLARE_BUCKETNAME` = `posta-postiz-media`
   - `CLOUDFLARE_BUCKET_URL` = the public bucket URL
   - `STORAGE_PROVIDER` = `cloudflare` (replaces `local`)

**Option B — Render persistent disk**

Cheaper to ignore (R2's free tier is generous), but if you don't want
another vendor:

In `render.yaml`, add to the `posta-postiz` service:
```yaml
disk:
  name: postiz-uploads
  mountPath: /app/uploads
  sizeGB: 1
```
Then redeploy the Blueprint. Adds ~$0.25/GB/mo.

### 6. Verify

After Render shows all services healthy:

1. Open Postiz UI -> Launches -> **Add Channel** -> **Facebook**.
2. OAuth popup -> log in with the BBQ Kings owner account -> select
   the BBQ Kings Page -> Allow.
3. Channel appears connected. Schedule a test post 3 minutes in the
   future. Wait. Confirm it appears on the BBQ Kings FB page.
4. If yes — hosting works. Tell Devin to start the migration code.

---

## Troubleshooting

**Postiz first boot takes 10+ minutes**: normal. It runs Prisma
migrations on the first deploy. Watch the Logs tab for
`Database migrations applied successfully`.

**`posta-postiz-temporal` keeps restarting**: it's waiting for its
Postgres to be reachable. Wait 5 min after `postiz-temporal-db` shows
"available". If still restarting, check Logs for the actual error.

**Postiz logs say "ECONNREFUSED temporal:7233"**: the
`TEMPORAL_ADDRESS` env var didn't pick up the right hostname. In Render
-> posta-postiz -> Environment, manually set
`TEMPORAL_ADDRESS=posta-postiz-temporal:7233` and save.

**Out of memory**: starter plan = 512 MB RAM. Postiz typically uses
~400–500 MB. If OOM kicks, upgrade the service to **standard** ($25/mo,
2 GB) for that one service. Same for Temporal if it OOMs.

---

## Future migration: Render -> Oracle Cloud Free

Once Susanne has a virtual debit card that passes Oracle's payment
verification (Chipper Cash, Eversend, or a bank-issued USD Visa),
migrate Postiz to Oracle Always Free (4 vCPU + 24 GB RAM ARM VM, $0/mo
forever).

Steps (Devin's job — ~2 hours):
1. Provision Oracle ARM VM in Frankfurt.
2. Install Docker + the existing Postiz docker-compose.
3. Backup-and-restore Postgres data: `pg_dump` from Render ->
   `pg_restore` on Oracle. Same for Temporal DB.
4. Point a custom domain (`postiz.posta.ug` or similar) at the Oracle
   public IP via Cloudflare DNS.
5. Update Postiz `MAIN_URL` to the new domain.
6. Update Posta's `POSTIZ_BASE_URL` env var to the new domain.
7. Test, then tear down the Render Postiz services. Keep posta-backend
   on Render.

End state: Posta backend $0 (Render free) + Postiz $0 (Oracle free) =
$0/mo total hosting cost for unlimited accounts.
