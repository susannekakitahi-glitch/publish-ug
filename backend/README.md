# Posta backend (Zernio proxy)

Small FastAPI proxy that keeps the `ZERNIO_API_KEY` off the browser.

Deployment target is **Render** (free tier, no credit card required). The
blueprint at repo root (`render.yaml`) provisions everything; set
`ZERNIO_API_KEY` in the Render service's Environment tab.

(An older deployment also exists on Fly.io at `posta-backend-ucvedwse`. The
`fly.toml` in this folder still works for that target but is no longer the
primary; new deploys should go to Render.)

## Local dev

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
export ZERNIO_API_KEY=sk_...              # your Zernio key
uvicorn app.main:app --reload --port 8080
```

Visit http://localhost:8080/health — it should return
`{"ok": true, "api_key_set": true}`.

## Deploy to Render (recommended)

1. Sign in to https://render.com with GitHub.
2. Click **New +** → **Blueprint**.
3. Pick the `publish-ug` repository. Render reads `render.yaml` at the repo
   root and provisions a free-tier web service rooted at `backend/`.
4. In the new service's **Environment** tab, add `ZERNIO_API_KEY` with your
   real Zernio secret (the `sync: false` flag in the blueprint tells Render
   to prompt for it rather than store it in git).
5. Render builds + deploys automatically on every push to `main`.

The service URL will be `https://posta-backend.onrender.com` (or a variant
if the name is taken). Update the frontend's `.env.production` to match
via `VITE_POSTA_BACKEND=https://posta-backend.onrender.com`.

Free-tier caveat: the service spins down after ~15 min of inactivity. The
first request after that takes ~30s to cold-start; subsequent requests are
fast. Good enough for Posta's current volume; if latency starts hurting,
upgrade to the $7/mo Starter tier or add a cron that pings `/health` every
10 minutes.

## Deploy to Fly (legacy)

First deploy only (one-time):

```bash
flyctl secrets set ZERNIO_API_KEY=sk_your_real_key -a posta-backend-ucvedwse
flyctl deploy -a posta-backend-ucvedwse
```

Subsequent deploys are just `flyctl deploy`. Rotate the key with another
`flyctl secrets set` — Fly re-deploys the machines automatically.

**Never** put the key in `fly.toml [env]` — that file is committed to git
and values in `[env]` are plaintext in releases. Use `flyctl secrets set`.

## Endpoints

| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/health`                     | Liveness + `api_key_set` flag.   |
| POST   | `/profiles`                   | Create a Zernio profile.         |
| GET    | `/profiles`                   | List profiles.                   |
| GET    | `/profiles/{id}/accounts`     | List connected social accounts.  |
| GET    | `/connect/{platform}`         | Hosted-OAuth URL for a platform. |
| POST   | `/post`                       | Publish or schedule a post.      |
