"""Posta backend proxy to Zernio (formerly Late.dev).

Keeps the ZERNIO_API_KEY off the browser. Exposes a narrow surface:
  GET  /health
  POST /profiles                         create a Zernio profile
  GET  /profiles/{pid}/accounts          list connected social accounts
  GET  /connect/{platform}?profileId=..  return the hosted-OAuth URL
  POST /post                             publish or schedule a post

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
    async with _client() as c:
        params: dict[str, str] = {"profileId": profileId}
        if returnTo:
            params["returnTo"] = returnTo
        r = await c.get(f"/connect/{platform}", params=params)
        return await _raise(r)


class PostIn(BaseModel):
    profileId: str
    text: str
    socialAccountIds: list[str]
    scheduledAt: Optional[str] = None  # ISO 8601
    mediaUrls: Optional[list[str]] = None


@app.post("/post")
async def create_post(body: PostIn) -> Any:
    payload: dict[str, Any] = {
        "profileId": body.profileId,
        "text": body.text,
        "socialAccountIds": body.socialAccountIds,
    }
    if body.scheduledAt:
        payload["scheduledAt"] = body.scheduledAt
    if body.mediaUrls:
        payload["mediaUrls"] = body.mediaUrls
    async with _client() as c:
        r = await c.post("/post", json=payload)
        return await _raise(r)
