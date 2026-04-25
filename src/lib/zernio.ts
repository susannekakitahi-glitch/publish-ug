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
