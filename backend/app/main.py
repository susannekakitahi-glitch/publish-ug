"""Posta backend proxy to Zernio (formerly Late.dev).

Keeps the ZERNIO_API_KEY off the browser. Exposes a narrow surface:
  GET  /health
  POST /profiles                         create a Zernio profile
  GET  /profiles/{pid}/accounts          list connected social accounts
  GET  /connect/{platform}?profileId=..  return the hosted-OAuth URL
  POST /post                             publish or schedule a post
  GET  /posts/{id}                       per-post status + platform results
  GET  /analytics?profileId=..           aggregated post analytics
  GET  /analytics/post/{id}              single-post analytics (addon gated)
  GET  /analytics/follower-stats         follower counts / growth

CORS is open; auth between frontend and backend is deliberately light because
the UG/Africa MVP is still pre-prod. The only sensitive value that must never
leak is ZERNIO_API_KEY, which is held server-side.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ZERNIO_BASE = "https://zernio.com/api/v1"
ALLOWED_PLATFORMS = {
    "facebook",
    "instagram",
    "twitter",
    "linkedin",
    "tiktok",
    "youtube",
    "whatsapp",
    "telegram",
}
# ZERNIO_API_KEY must come from the runtime environment — typically from a
# Fly secret (`flyctl secrets set ZERNIO_API_KEY=... -a posta-backend-...`)
# or from a local .env for development. The previous `_secret.py` fallback
# was removed intentionally so a missing secret fails loudly instead of
# silently reading a committed key.
API_KEY = os.environ.get("ZERNIO_API_KEY") or os.environ.get("LATE_API_KEY")

app = FastAPI(title="Posta proxy", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client() -> httpx.AsyncClient:
    if not API_KEY:
        raise HTTPException(500, "ZERNIO_API_KEY is not configured on the server")
    return httpx.AsyncClient(
        base_url=ZERNIO_BASE,
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=30.0,
    )


async def _raise(r: httpx.Response) -> Any:
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise HTTPException(r.status_code, detail)
    return r.json()


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "api_key_set": bool(API_KEY)}


class ProfileIn(BaseModel):
    name: str
    description: Optional[str] = None


@app.post("/profiles")
async def create_profile(body: ProfileIn) -> Any:
    async with _client() as c:
        r = await c.post(
            "/profiles",
            json={"name": body.name, "description": body.description or ""},
        )
        return await _raise(r)


@app.get("/profiles")
async def list_profiles() -> Any:
    async with _client() as c:
        r = await c.get("/profiles")
        return await _raise(r)


@app.get("/profiles/{profile_id}/accounts")
async def list_accounts(profile_id: str) -> Any:
    async with _client() as c:
        # Zernio exposes /accounts with profileId as a query param
        r = await c.get("/accounts", params={"profileId": profile_id})
        return await _raise(r)


@app.get("/connect/{platform}")
async def get_connect_url(
    platform: str,
    profileId: str = Query(...),
    returnTo: Optional[str] = None,
) -> Any:
    if platform not in ALLOWED_PLATFORMS:
        raise HTTPException(400, f"Unsupported platform: {platform}")
    async with _client() as c:
        params: dict[str, str] = {"profileId": profileId}
        if returnTo:
            params["returnTo"] = returnTo
        r = await c.get(f"/connect/{platform}", params=params)
        return await _raise(r)


class PostPlatform(BaseModel):
    platform: str
    accountId: str
    customContent: Optional[str] = None


class PostMediaItem(BaseModel):
    type: str  # "image" | "video"
    url: str
    thumbnail: Optional[str] = None


class PostIn(BaseModel):
    """Subset of Zernio's POST /v1/posts body that Posta needs.

    Posta keeps clientId / scheduledFor / per-platform overrides server-side
    via this proxy so the API key never leaves the box. Anything we don't
    expose here is currently out of scope (recycling, queues, ad campaigns).
    """

    content: str
    platforms: list[PostPlatform]
    scheduledFor: Optional[str] = None  # ISO 8601, future timestamp
    publishNow: bool = False
    mediaItems: Optional[list[PostMediaItem]] = None
    timezone: Optional[str] = None
    hashtags: Optional[list[str]] = None
    title: Optional[str] = None


@app.post("/post")
async def create_post(body: PostIn) -> Any:
    """Proxy to Zernio's POST /v1/posts.

    Note: route exposed as /post (singular) for Posta backwards-compat with
    the earlier mock; the upstream Zernio path is /v1/posts (plural).
    """
    # Validate every platform in the body against the allow-list before we
    # touch Zernio. Avoids leaking a useful error message about unsupported
    # platforms to whoever's calling this proxy.
    for p in body.platforms:
        if p.platform not in ALLOWED_PLATFORMS:
            raise HTTPException(400, f"Unsupported platform: {p.platform}")

    payload: dict[str, Any] = {
        "content": body.content,
        "platforms": [p.model_dump(exclude_none=True) for p in body.platforms],
    }
    if body.scheduledFor:
        payload["scheduledFor"] = body.scheduledFor
    if body.publishNow:
        payload["publishNow"] = True
    if body.mediaItems:
        payload["mediaItems"] = [m.model_dump(exclude_none=True) for m in body.mediaItems]
    if body.timezone:
        payload["timezone"] = body.timezone
    if body.hashtags:
        payload["hashtags"] = body.hashtags
    if body.title:
        payload["title"] = body.title

    async with _client() as c:
        r = await c.post("/posts", json=payload)
        return await _raise(r)


@app.get("/posts/{post_id}")
async def get_post(post_id: str) -> Any:
    """Proxy to Zernio's GET /v1/posts/{postId}.

    Returns per-post status (scheduled / published / failed / partial) plus
    per-platform results including platformPostUrl for published platforms
    and error messages for failed ones. Free endpoint — does not require
    the Analytics add-on.
    """
    async with _client() as c:
        r = await c.get(f"/posts/{post_id}")
        return await _raise(r)


@app.get("/analytics/post/{post_id}")
async def get_post_analytics(post_id: str) -> Any:
    """Proxy to Zernio's GET /v1/analytics?postId=..., per-post variant.

    Returns reach / impressions / engagement / clicks for a single post.
    Requires the Analytics add-on ($10/mo) — upstream returns 402 when it
    is not enabled; we forward that verbatim so the frontend can decide
    whether to fall back to seeded numbers.
    """
    async with _client() as c:
        r = await c.get("/analytics", params={"postId": post_id})
        return await _raise(r)


@app.get("/analytics")
async def get_analytics(
    profileId: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    page: int = Query(1, ge=1),
    sortBy: Optional[str] = Query(None),
    order: Optional[str] = Query(None),
) -> Any:
    params: dict[str, Any] = {"limit": limit, "page": page}
    if profileId:
        params["profileId"] = profileId
    if platform:
        if platform not in ALLOWED_PLATFORMS:
            raise HTTPException(400, f"Unsupported platform: {platform}")
        params["platform"] = platform
    if fromDate:
        params["fromDate"] = fromDate
    if toDate:
        params["toDate"] = toDate
    if sortBy:
        params["sortBy"] = sortBy
    if order:
        params["order"] = order
    async with _client() as c:
        r = await c.get("/analytics", params=params)
        return await _raise(r)


@app.get("/analytics/follower-stats")
async def get_follower_stats(
    profileId: Optional[str] = Query(None),
    accountIds: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    granularity: Optional[str] = Query(None),
) -> Any:
    params: dict[str, Any] = {}
    if profileId:
        params["profileId"] = profileId
    if accountIds:
        params["accountIds"] = accountIds
    if fromDate:
        params["fromDate"] = fromDate
    if toDate:
        params["toDate"] = toDate
    if granularity:
        if granularity not in {"daily", "weekly", "monthly"}:
            raise HTTPException(400, f"Unsupported granularity: {granularity}")
        params["granularity"] = granularity
    async with _client() as c:
        r = await c.get("/accounts/follower-stats", params=params)
        return await _raise(r)
