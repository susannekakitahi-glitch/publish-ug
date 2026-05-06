/**
 * Posta frontend ↔ Zernio backend proxy.
 *
 * The backend hides the real Zernio API key. If VITE_POSTA_BACKEND is unset
 * (local dev / static preview with no backend) zernioEnabled() returns false
 * and the Onboarding UI hides the Real OAuth toggle, falling back entirely
 * to the mock flow.
 */
import type { Platform } from "./state";

const BASE = import.meta.env.VITE_POSTA_BACKEND || "";

/** Mapping from Posta's internal platform key (e.g. "x") to the string
 *  Zernio uses in its API (e.g. "twitter"). Exported so schedulePost() can
 *  resolve the right value when calling POST /v1/posts. */
export const ZERNIO_PLATFORM: Record<Platform, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  pinterest: "pinterest",
  threads: "threads",
  reddit: "reddit",
  bluesky: "bluesky",
  snapchat: "snapchat",
  discord: "discord",
  // Posta uses the short id "gmb"; Zernio's API key is the full
  // "google-business-profile" string.
  gmb: "google-business-profile",
  whatsapp: "whatsapp",
  telegram: "telegram",
};

export function zernioEnabled(): boolean {
  return Boolean(BASE);
}

function requireBase(): string {
  if (!BASE) {
    throw new Error(
      "Zernio backend not configured. Set VITE_POSTA_BACKEND at build time."
    );
  }
  return BASE;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${requireBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${text.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

export interface ZernioProfile {
  _id: string;
  name: string;
  isDefault?: boolean;
}

export async function listProfiles(): Promise<ZernioProfile[]> {
  const r = await j<{ profiles: ZernioProfile[] }>("/profiles");
  return r.profiles || [];
}

export async function createProfile(name: string): Promise<ZernioProfile> {
  const r = await j<{ profile: ZernioProfile }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return r.profile;
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  name?: string;
  profileId?: string;
}

export async function listAccounts(profileId: string): Promise<ZernioAccount[]> {
  const r = await j<{ accounts?: ZernioAccount[] }>(
    `/profiles/${profileId}/accounts`
  );
  return r.accounts || [];
}

/** Permanently unlink a social account from the caller's Zernio profile.
 *  Returns true on success. Treats 404 as success (the account is
 *  already gone upstream) so Posta can self-heal when a stale _id is
 *  referenced after a background cleanup / re-sync race. */
export async function deleteAccount(accountId: string): Promise<boolean> {
  try {
    await j(`/accounts/${accountId}`, { method: "DELETE" });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("404")) return true;
    throw e;
  }
}

export async function getConnectUrl(
  platform: Platform,
  profileId: string
): Promise<string> {
  const zp = ZERNIO_PLATFORM[platform];
  const r = await j<{ authUrl: string }>(
    `/connect/${zp}?profileId=${encodeURIComponent(profileId)}`
  );
  return r.authUrl;
}

/** Shape of one post row inside the /analytics paginated list. */
export interface ZernioAnalyticsRow {
  postId?: string;
  status?: string;
  content?: string;
  publishedAt?: string;
  platform?: string;
  analytics?: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    views?: number;
    engagementRate?: number;
  };
  platformAnalytics?: Array<{
    platform?: string;
    analytics?: {
      impressions?: number;
      reach?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      clicks?: number;
    };
  }>;
}

/** Rollup computed from a ZernioAnalyticsRow[] for use in the Dashboard. */
export interface AnalyticsSummary {
  posts: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
}

export const EMPTY_SUMMARY: AnalyticsSummary = {
  posts: 0,
  impressions: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  clicks: 0,
  engagementRate: 0,
};

export type AnalyticsResult =
  | { kind: "ok"; summary: AnalyticsSummary; rows: ZernioAnalyticsRow[] }
  | { kind: "addon_required"; message: string }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/**
 * Fetch post analytics for a profile and compute a dashboard-friendly rollup.
 *
 * Returns `addon_required` when Zernio replies 402 (the Analytics add-on is
 * $10/mo on top of the base plan) so the UI can render an upsell instead of a
 * hard error. Returns `empty` when the profile has no posts in the window
 * (the common new-user case). `error` is reserved for unexpected failures.
 */
export async function getAnalyticsForProfile(
  profileId: string,
  fromDate?: string,
  toDate?: string
): Promise<AnalyticsResult> {
  if (!zernioEnabled()) return { kind: "error", message: "backend not configured" };
  const qs = new URLSearchParams({ profileId, limit: "100" });
  if (fromDate) qs.set("fromDate", fromDate);
  if (toDate) qs.set("toDate", toDate);
  try {
    const r = await fetch(`${requireBase()}/analytics?${qs}`);
    if (r.status === 402) {
      return {
        kind: "addon_required",
        message:
          "Zernio analytics add-on required ($10/mo) to see live reach, engagement and clicks.",
      };
    }
    if (!r.ok) {
      const text = await r.text();
      return { kind: "error", message: `${r.status} ${text.slice(0, 200)}` };
    }
    const data = await r.json();
    const rows: ZernioAnalyticsRow[] = Array.isArray(data)
      ? data
      : data?.results || data?.posts || [];
    if (!rows.length) return { kind: "empty" };
    const summary = rollupAnalytics(rows);
    return { kind: "ok", summary, rows };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

export interface PublishPlatform {
  platform: string;
  accountId: string;
  customContent?: string;
}

export interface PublishMediaItem {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

export interface PublishPostRequest {
  content: string;
  platforms: PublishPlatform[];
  scheduledFor?: string;
  publishNow?: boolean;
  mediaItems?: PublishMediaItem[];
  timezone?: string;
  hashtags?: string[];
  title?: string;
}

export type PublishResult =
  | { kind: "ok"; zernioPostId: string; raw: unknown }
  | { kind: "duplicate"; message: string }
  | { kind: "error"; status: number; message: string };

/**
 * Publish or schedule a post via the backend proxy to Zernio /v1/posts.
 *
 * Never throws. Returns a discriminated union so callers can distinguish:
 * - successful schedule (keeps local post as `queued`, attaches zernioPostId),
 * - 409 duplicate-content (Zernio blocks same text to same account within 24h),
 * - any other error (mark the local post `failed` with the message).
 */
/** Pull the most useful error string from a non-2xx fetch Response.
 *  Handles:
 *  - plain text bodies,
 *  - Zernio JSON ({error: "..."}),
 *  - FastAPI-wrapped JSON ({detail: {...}} or {detail: "..."}).
 */
async function extractErrorMessage(r: Response, fallback: string): Promise<string> {
  const raw = await r.text();
  try {
    const data = JSON.parse(raw);
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const inner = (detail as { error?: string; message?: string }).error
        ?? (detail as { error?: string; message?: string }).message;
      if (inner) return inner;
    }
    const topLevel = data?.error ?? data?.message;
    if (topLevel) return topLevel;
  } catch {
    // fall through — not JSON, use the raw text trimmed below
  }
  return (raw || fallback).slice(0, 300);
}

export async function publishPost(body: PublishPostRequest): Promise<PublishResult> {
  if (!zernioEnabled()) {
    return { kind: "error", status: 0, message: "backend not configured" };
  }
  try {
    const r = await fetch(`${requireBase()}/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 409) {
      // Backend wraps upstream errors as FastAPI HTTPException(detail=...),
      // so the body is {detail: <zernio_body>} where <zernio_body> is
      // typically {error: "..."} from Zernio. Unwrap both layers.
      return { kind: "duplicate", message: await extractErrorMessage(r, "Zernio rejected duplicate content") };
    }
    if (!r.ok) {
      return {
        kind: "error",
        status: r.status,
        message: await extractErrorMessage(r, `HTTP ${r.status}`),
      };
    }
    const data = await r.json();
    const zernioPostId =
      data?.post?._id || data?._id || data?.id || "";
    if (!zernioPostId) {
      return {
        kind: "error",
        status: 500,
        message: "Zernio responded without a post id",
      };
    }
    return { kind: "ok", zernioPostId, raw: data };
  } catch (e) {
    return { kind: "error", status: 0, message: (e as Error).message };
  }
}

/** Per-platform result inside a Zernio post document. */
export interface ZernioPlatformResult {
  platform: string;
  status: "pending" | "published" | "failed" | string;
  error?: string;
  platformPostUrl?: string;
  platformPostId?: string;
}

/** Post-level status as reported by Zernio's GET /v1/posts/{id}. */
export interface ZernioPostStatus {
  _id: string;
  status: "scheduled" | "published" | "failed" | "partial" | "draft" | string;
  platforms: ZernioPlatformResult[];
  publishedAt?: string;
  scheduledFor?: string;
}

export type PostStatusResult =
  | { kind: "ok"; post: ZernioPostStatus }
  | { kind: "not_found" }
  | { kind: "error"; status: number; message: string };

/** Fetch a Zernio post's upstream status + per-platform results.
 *
 * Used by the /schedule poller to reconcile local queued/sent state with
 * what Zernio actually did. Never throws — callers branch on `kind`.
 */
export async function getPostStatus(
  zernioPostId: string
): Promise<PostStatusResult> {
  if (!zernioEnabled()) {
    return { kind: "error", status: 0, message: "backend not configured" };
  }
  try {
    const r = await fetch(
      `${requireBase()}/posts/${encodeURIComponent(zernioPostId)}`
    );
    if (r.status === 404) return { kind: "not_found" };
    if (!r.ok) {
      return {
        kind: "error",
        status: r.status,
        message: await extractErrorMessage(r, `HTTP ${r.status}`),
      };
    }
    const data = await r.json();
    const post = (data?.post ?? data) as Partial<ZernioPostStatus>;
    if (!post?._id || !Array.isArray(post.platforms)) {
      return { kind: "error", status: 500, message: "malformed post response" };
    }
    return {
      kind: "ok",
      post: {
        _id: post._id,
        status: post.status ?? "scheduled",
        platforms: post.platforms,
        publishedAt: post.publishedAt,
        scheduledFor: post.scheduledFor,
      },
    };
  } catch (e) {
    return { kind: "error", status: 0, message: (e as Error).message };
  }
}

export interface UpdatePostRequest {
  content?: string;
  scheduledFor?: string;
}

export type UpdatePostResult =
  | { kind: "ok"; raw: unknown }
  | { kind: "not_found" }
  | { kind: "too_late"; message: string }
  | { kind: "error"; status: number; message: string };

/** Edit a Zernio-queued post.
 *
 * Zernio rejects edits to published / publishing / cancelled posts with a
 * 4xx; surfaces as `too_late` so callers can flip the local card to sent
 * (Zernio already won) instead of leaving stale text in place.
 */
export async function updatePost(
  zernioPostId: string,
  body: UpdatePostRequest
): Promise<UpdatePostResult> {
  if (!zernioEnabled()) {
    return { kind: "error", status: 0, message: "backend not configured" };
  }
  try {
    const r = await fetch(
      `${requireBase()}/posts/${encodeURIComponent(zernioPostId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (r.status === 404) return { kind: "not_found" };
    if (r.status === 409 || r.status === 422 || r.status === 400) {
      return {
        kind: "too_late",
        message: await extractErrorMessage(r, "Zernio rejected the edit"),
      };
    }
    if (!r.ok) {
      return {
        kind: "error",
        status: r.status,
        message: await extractErrorMessage(r, `HTTP ${r.status}`),
      };
    }
    return { kind: "ok", raw: await r.json().catch(() => ({})) };
  } catch (e) {
    return { kind: "error", status: 0, message: (e as Error).message };
  }
}

export type DeletePostResult =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "too_late"; message: string }
  | { kind: "error"; status: number; message: string };

/** Cancel a Zernio-queued post.
 *
 * Only valid for draft / scheduled posts. Already-published posts return
 * a 4xx that surfaces as `too_late` — local card stays at `sent`.
 */
export async function deletePost(
  zernioPostId: string
): Promise<DeletePostResult> {
  if (!zernioEnabled()) {
    return { kind: "error", status: 0, message: "backend not configured" };
  }
  try {
    const r = await fetch(
      `${requireBase()}/posts/${encodeURIComponent(zernioPostId)}`,
      { method: "DELETE" }
    );
    if (r.status === 404) return { kind: "not_found" };
    if (r.status === 409 || r.status === 422 || r.status === 400) {
      return {
        kind: "too_late",
        message: await extractErrorMessage(r, "Zernio rejected the cancel"),
      };
    }
    if (!r.ok) {
      return {
        kind: "error",
        status: r.status,
        message: await extractErrorMessage(r, `HTTP ${r.status}`),
      };
    }
    return { kind: "ok" };
  } catch (e) {
    return { kind: "error", status: 0, message: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Media upload (Zernio's own presigned-URL flow — no R2/S3 needed)
// ---------------------------------------------------------------------------

export interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  type: "image" | "video" | string;
}

export type PresignResult =
  | { kind: "ok"; data: PresignResponse }
  | { kind: "error"; status: number; message: string };

/** Request a presigned upload URL from Zernio (via our /media/presign proxy).
 *
 *  Caller PUTs the file directly to data.uploadUrl, then references
 *  data.publicUrl in the post's mediaItems[]. We never see the bytes
 *  server-side — the proxy only handles the key/url metadata exchange.
 */
export async function presignMedia(
  filename: string,
  contentType: string,
  size?: number
): Promise<PresignResult> {
  if (!zernioEnabled()) {
    return { kind: "error", status: 0, message: "backend not configured" };
  }
  try {
    const r = await fetch(`${requireBase()}/media/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentType, size }),
    });
    if (!r.ok) {
      return {
        kind: "error",
        status: r.status,
        message: await extractErrorMessage(r, `HTTP ${r.status}`),
      };
    }
    return { kind: "ok", data: (await r.json()) as PresignResponse };
  } catch (e) {
    return { kind: "error", status: 0, message: (e as Error).message };
  }
}

export type UploadResult =
  | { kind: "ok"; publicUrl: string; type: "image" | "video" }
  | { kind: "error"; message: string };

/** Composite helper: presign → PUT the file to Zernio's storage.
 *
 *  Returns the publicUrl on success so the caller can stash it on the
 *  ScheduledPost.media[] item. The PUT to uploadUrl bypasses our proxy
 *  entirely (it's a presigned S3-style URL straight to Zernio's bucket),
 *  which is why we read uploadUrl out of the presign response and use
 *  the global fetch — no Authorization header is allowed.
 *
 *  contentType MUST match what was passed to presignMedia(); the
 *  presigned URL's signature is bound to it. We forward file.type
 *  unconditionally so the two stay in lock-step.
 */
export async function uploadMediaFile(file: File): Promise<UploadResult> {
  const contentType = file.type;
  const presigned = await presignMedia(file.name, contentType, file.size);
  if (presigned.kind === "error") {
    return { kind: "error", message: presigned.message };
  }
  const { uploadUrl, publicUrl, type } = presigned.data;
  try {
    const r = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!r.ok) {
      return {
        kind: "error",
        message: `Upload failed: ${r.status} ${r.statusText}`,
      };
    }
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
  // Zernio's presign response says `type: "image" | "video"` (mapped from
  // the contentType prefix). Anything else is unexpected — narrow it.
  const narrowed: "image" | "video" =
    type === "video" ? "video" : "image";
  return { kind: "ok", publicUrl, type: narrowed };
}

export type PostAnalyticsResult =
  | { kind: "ok"; reach: number; clicks: number; impressions: number }
  | { kind: "addon_required" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

/** Fetch reach/clicks/impressions for a single Zernio post.
 *
 * Requires the Zernio Analytics add-on — returns `addon_required` when the
 * upstream replies 402. Callers should fall back silently (keep seeded or
 * zero numbers) in that case.
 */
export async function getPostAnalytics(
  zernioPostId: string
): Promise<PostAnalyticsResult> {
  if (!zernioEnabled()) return { kind: "error", message: "backend not configured" };
  try {
    const r = await fetch(
      `${requireBase()}/analytics/post/${encodeURIComponent(zernioPostId)}`
    );
    if (r.status === 402) return { kind: "addon_required" };
    if (r.status === 404) return { kind: "not_found" };
    // Zernio returns 202 while analytics are still syncing for a fresh
    // post; treat as "not ready yet" — the next poll will pick it up.
    if (r.status === 202) return { kind: "not_found" };
    if (!r.ok) {
      return { kind: "error", message: `${r.status}` };
    }
    const data = await r.json();
    const row =
      (data?.post as ZernioAnalyticsRow | undefined) ??
      (Array.isArray(data?.results) ? (data.results[0] as ZernioAnalyticsRow) : undefined) ??
      (data as ZernioAnalyticsRow);
    const a = row?.analytics ?? {};
    return {
      kind: "ok",
      reach: a.reach ?? 0,
      clicks: a.clicks ?? 0,
      impressions: a.impressions ?? 0,
    };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

function rollupAnalytics(rows: ZernioAnalyticsRow[]): AnalyticsSummary {
  const out: AnalyticsSummary = { ...EMPTY_SUMMARY };
  let engSum = 0;
  let engCount = 0;
  for (const row of rows) {
    const a = row.analytics || {};
    out.posts += 1;
    out.impressions += a.impressions || 0;
    out.reach += a.reach || 0;
    out.likes += a.likes || 0;
    out.comments += a.comments || 0;
    out.shares += a.shares || 0;
    out.clicks += a.clicks || 0;
    if (typeof a.engagementRate === "number") {
      engSum += a.engagementRate;
      engCount += 1;
    }
  }
  out.engagementRate = engCount ? +(engSum / engCount).toFixed(2) : 0;
  return out;
}
