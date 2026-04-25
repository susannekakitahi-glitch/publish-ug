# Posta backend (Zernio proxy)

Small FastAPI proxy that keeps the `ZERNIO_API_KEY` off the browser. Deployed
to Fly.io at `posta-backend-ucvedwse`.

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

## Deploy to Fly

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
