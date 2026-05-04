/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PlanId } from "./pricing";
import {
  deletePost,
  getPostAnalytics,
  getPostStatus,
  publishPost,
  updatePost,
  zernioEnabled,
  ZERNIO_PLATFORM,
  type PublishMediaItem,
  type PublishPlatform,
  type ZernioPlatformResult,
} from "./zernio";

export type Platform =
  | "facebook"
  | "instagram"
  | "x"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "whatsapp"
  | "telegram";

export const ALL_PLATFORMS: { id: Platform; label: string; ico: string }[] = [
  { id: "facebook", label: "Facebook", ico: "FB" },
  { id: "instagram", label: "Instagram", ico: "IG" },
  { id: "x", label: "X", ico: "X" },
  { id: "linkedin", label: "LinkedIn", ico: "IN" },
  { id: "tiktok", label: "TikTok", ico: "TT" },
  { id: "youtube", label: "YouTube", ico: "YT" },
  { id: "whatsapp", label: "WhatsApp", ico: "WA" },
  { id: "telegram", label: "Telegram", ico: "TG" },
];

export interface MediaItem {
  kind: "image" | "video";
  name: string;
  /** Local preview as a data: URI. For images this is the downscaled jpeg
   *  used both for the in-app preview and (until upload finishes) as the
   *  source-of-truth bytes. For videos this is the captured poster frame
   *  — the actual playable bytes are uploaded separately and referenced
   *  via publicUrl below. */
  dataUrl: string;
  size: number;
  /** Public URL once uploaded to Zernio's storage via /v1/media/presign.
   *  Required to actually publish the file to a social platform — Zernio
   *  fetches the URL when it sends the post upstream. Absent while the
   *  upload is in flight or if it failed. */
  publicUrl?: string;
  /** Truthy while the file is being uploaded to Zernio. Compose blocks
   *  scheduling while any item is uploading so we never schedule a post
   *  that references a media item Zernio cannot fetch. */
  uploading?: boolean;
  /** Set if the upload failed (network, 4xx from Zernio, etc.). The user
   *  is offered a retry; scheduling stays blocked while this is set. */
  uploadError?: string;
}

export type PostStatus =
  | "queued"
  | "sent"
  | "failed"
  | "draft"
  | "pending_approval";

export interface ScheduledPost {
  id: string;
  text: string;
  kind: "status" | "photo" | "carousel" | "video" | "youtube";
  platforms: Platform[];
  scheduledAt: string;
  status: PostStatus;
  media?: MediaItem[];
  reach?: number;
  clicks?: number;
  clientId?: string;
  /** Zernio post _id once the post has been pushed to Zernio's queue. */
  zernioPostId?: string;
  /** Reason for status==="failed" surfaced to the user in /schedule. */
  failureReason?: string;
  /** When true, Zernio is asked to publish immediately (publishNow=true,
   *  scheduledFor omitted) instead of holding the post in its queue.
   *  scheduledAt still carries the timestamp the user clicked Post now so
   *  the local Calendar sorts the row correctly. */
  publishNow?: boolean;
  /** Back-reference to a RecurringRule when this post is one materialized
   *  occurrence of a repeating series. Used by the Recurring Posts UI to
   *  show "this is the 3rd of 12 in 'Friday promo'" and to cancel the
   *  rest of the series when the rule is paused / deleted. */
  recurringRuleId?: string;
}

export interface ConnectedAccount {
  platform: Platform;
  handle: string;
  connectedAt: string;
  clientId?: string;
  /** Zernio's account `_id` — required to publish to this account via the
   *  Zernio /v1/posts API. Absent for mock-mode / legacy connections. */
  zernioAccountId?: string;
}

export interface TrendingPost {
  id: string;
  platform: Platform;
  caption: string;
  reach: number;
  clicks: number;
  engagementRate: number; // 0..1
  author: string; // anonymized handle, e.g. "+256 702 ***471"
  postedAt: string; // ISO
}

export interface TrendingHashtag {
  tag: string; // includes leading "#"
  platform: Platform;
  uses: number; // how many member posts used it this week
  reach: number; // total reach contributed
  deltaPct: number; // % change vs last week; +12 / -4
}

export interface Org {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  seatLimit: number;
  monthlyUgx: number;
  annualUgx: number;
  trendingPosts: TrendingPost[];
  trendingHashtags: TrendingHashtag[];
}

export interface Client {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /** Zernio profile ID for this client's social accounts (per-tenant). */
  zernioProfileId?: string;
}

/**
 * A reusable caption + post-kind preset the user can save and re-apply on
 * Compose. Stored on the device alongside posts/accounts via the same
 * localStorage row. Per-tenant scoping isn't applied here intentionally:
 * agency users often want the same caption pattern across clients (e.g.
 * "Happy Friday from <brand>") so we keep templates global to the user.
 */
export interface PostTemplate {
  id: string;
  name: string;
  text: string;
  kind: ScheduledPost["kind"];
  createdAt: string;
  updatedAt: string;
}

/**
 * A repeating-post rule. Captures "post this caption every Friday at
 * 9 AM for 12 weeks". The rule itself is just metadata — each concrete
 * occurrence is still a regular ScheduledPost with a recurringRuleId
 * back-reference, so the existing Queue / Calendar / Zernio-sync /
 * approval flows keep working unchanged.
 *
 * Materialization model: **upfront**. When the rule is created we
 * generate every occurrence in one go (up to the `endBy` cap), each
 * as its own ScheduledPost. This gives users immediate visibility in
 * the calendar + queue, and keeps publish logic uniform with
 * non-recurring posts. Downsides are bounded by the end condition
 * (max 52 weekly / 365 daily / 24 monthly occurrences) so we never
 * flood localStorage.
 *
 * Scoping: recurring rules are per-client in agency mode (carry the
 * same clientId as their materialized occurrences) so the
 * Agency "switch client" UX hides unrelated brands' series.
 */
export interface RecurringRule {
  id: string;
  /** Human-friendly label shown in the Settings list. Falls back to
   *  the first few words of the caption when unset. */
  name: string;
  /** Agency: which client brand the series belongs to. Undefined for
   *  solo / business / org plans. */
  clientId?: string;
  text: string;
  kind: ScheduledPost["kind"];
  platforms: Platform[];
  /** Media carried through to every occurrence. For photo / carousel
   *  / video kinds the same dataUrl/publicUrl is reused; the user can
   *  still edit a specific occurrence's media via the normal Edit
   *  flow in /schedule. */
  media?: MediaItem[];
  /** Cadence expressed as a discriminated union so the UI can render
   *  the right controls and occurrence generation can pattern-match
   *  on `cadence.type`. */
  cadence:
    | { type: "daily" }
    | { type: "weekly"; weekdays: number[] } // 0=Sunday .. 6=Saturday
    | { type: "monthly"; dayOfMonth: number }; // 1..28 (cap at 28 to dodge Feb edge cases)
  /** Local time of day the occurrence fires, HH:MM (24h). Applied in
   *  the user's local timezone (Africa/Kampala for Uganda). */
  timeOfDay: string;
  /** First occurrence's date (YYYY-MM-DD, local). Occurrences before
   *  this are skipped even if the cadence pattern would match. */
  startDate: string;
  /** End condition. "count" caps total occurrences; "date" caps the
   *  last scheduled-for date. */
  endBy: { type: "count"; count: number } | { type: "date"; date: string };
  /** When true, future occurrences are cancelled and no new ones are
   *  materialized. Past occurrences stay in the queue/sent list. */
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  name: string;
  phone: string;
  plan: PlanId;
  billingCycle: "monthly" | "annual";
  orgId?: string;
  postsUsed: number;
  postsQuota: number | "unlimited";
  accountsQuota: number | "unlimited";
  /** Zernio profile ID scoping this user's social accounts.
   *  Lazily provisioned on first Real OAuth use so demo/mock users don't
   *  consume the Zernio free-tier profile quota. Agency users keep per-client
   *  profile IDs on the Client record instead. */
  zernioProfileId?: string;
}

export interface AppState {
  user: User | null;
  posts: ScheduledPost[];
  accounts: ConnectedAccount[];
  orgs: Org[];
  clients: Client[];
  currentClientId: string | null;
  templates: PostTemplate[];
  recurringRules: RecurringRule[];
  signup: (
    name: string,
    phone: string,
    plan: PlanId,
    orgId?: string,
    billingCycle?: "monthly" | "annual"
  ) => void;
  login: (phone: string) => boolean;
  logout: () => void;
  connectAccount: (
    platform: Platform,
    handle: string,
    clientId?: string,
    zernioAccountId?: string
  ) => void;
  disconnectAccount: (platform: Platform, clientId?: string) => void;
  schedulePost: (p: Omit<ScheduledPost, "id" | "status">) => void;
  approvePost: (id: string) => void;
  /** Push an existing local post to Zernio. Useful for posts that were
   *  scheduled in Mock mode (no zernioPostId) and now that the user has
   *  switched to Real OAuth need to be sent upstream. No-op in Mock mode
   *  or if the post already has a zernioPostId. */
  pushPostToZernio: (id: string) => void;
  /** Cancel a queued / pending / failed post. When the post has a
   *  zernioPostId, also asks Zernio to drop it from the upstream queue
   *  before removing it locally. Mock-mode posts simply unlink locally. */
  cancelPost: (id: string) => Promise<void>;
  /** Edit a queued post's text and/or scheduled time. When the post has a
   *  zernioPostId, the same patch is forwarded to Zernio. Returns an
   *  outcome string the caller can surface in the UI:
   *  - "ok"            edit applied locally + upstream
   *  - "ok_local_only" mock-mode post; updated locally
   *  - "too_late"      Zernio refused — upstream already published
   *  - "error"         network / 5xx; local state untouched */
  editPost: (
    id: string,
    patch: { text?: string; scheduledAt?: string }
  ) => Promise<"ok" | "ok_local_only" | "too_late" | "error">;
  /** Mark a post as failed-to-publish with a human-readable reason. */
  markPostFailed: (id: string, reason: string) => void;
  /** Persist the Zernio post _id on a local ScheduledPost. */
  setPostZernioId: (id: string, zernioPostId: string) => void;
  /** Poll Zernio for the status + per-platform results of every local post
   *  with a zernioPostId that isn't in a terminal state yet; updates local
   *  post status / reach / clicks / failureReason from upstream. No-op in
   *  mock mode (no zernioPostId to poll). */
  syncPostStatuses: () => Promise<void>;
  topUpPosts: (count: number) => void;
  lookupOrg: (code: string) => Org | undefined;
  setPlan: (plan: PlanId, billingCycle?: "monthly" | "annual") => void;
  addClient: (name: string) => Client;
  renameClient: (id: string, name: string) => void;
  removeClient: (id: string) => void;
  selectClient: (id: string | null) => void;
  /** Persist the Zernio profile ID for the current user. */
  setUserZernioProfileId: (profileId: string) => void;
  /** Persist the Zernio profile ID for a specific client (Agency users). */
  setClientZernioProfileId: (clientId: string, profileId: string) => void;
  /** Save a new caption template. Returns the persisted record so the
   *  caller can surface its id (e.g. preselect after save). */
  addTemplate: (t: {
    name: string;
    text: string;
    kind: ScheduledPost["kind"];
  }) => PostTemplate;
  /** Update an existing template's name / text / kind. No-op if id is
   *  unknown. updatedAt is stamped automatically. */
  updateTemplate: (
    id: string,
    patch: Partial<Pick<PostTemplate, "name" | "text" | "kind">>
  ) => void;
  /** Delete a template. No-op if id is unknown. */
  removeTemplate: (id: string) => void;
  /** Create a recurring-post series. Materializes all occurrences
   *  upfront (each as a normal ScheduledPost) and returns the new
   *  rule along with how many occurrences were actually scheduled
   *  after applying the endBy cap + skipping times in the past. */
  addRecurringRule: (rule: {
    name?: string;
    clientId?: string;
    text: string;
    kind: ScheduledPost["kind"];
    platforms: Platform[];
    media?: MediaItem[];
    cadence: RecurringRule["cadence"];
    timeOfDay: string;
    startDate: string;
    endBy: RecurringRule["endBy"];
  }) => { rule: RecurringRule; scheduled: number };
  /** Pause a rule: cancel its future queued occurrences (past ones
   *  stay), flip paused=true. No-op if already paused. */
  pauseRecurringRule: (id: string) => Promise<void>;
  /** Resume a paused rule: re-materialize forward occurrences from
   *  max(startDate, today) up to endBy, skipping occurrences that
   *  already exist. Flips paused=false. */
  resumeRecurringRule: (id: string) => void;
  /** Delete a rule + cancel all its future queued occurrences. Past
   *  sent/queued-in-the-past occurrences keep their recurringRuleId
   *  stamp so history stays intact. */
  removeRecurringRule: (id: string) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const SEED_ORGS: Org[] = [
  {
    id: "elyon",
    name: "Elyon Business Network",
    inviteCode: "ELYON2026",
    memberCount: 742,
    seatLimit: 1000,
    monthlyUgx: 5_000,
    annualUgx: 48_000,
    trendingPosts: [
      {
        id: "t1",
        platform: "facebook",
        caption:
          "Weekend market at Nakawa — fresh produce from 12 Elyon vendors, starting 8am.",
        reach: 14_820,
        clicks: 612,
        engagementRate: 0.082,
        author: "+256 702 ***471",
        postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
      {
        id: "t2",
        platform: "tiktok",
        caption:
          "Behind the scenes: how our shea butter is processed in Gulu 🧴",
        reach: 38_400,
        clicks: 980,
        engagementRate: 0.121,
        author: "+256 772 ***019",
        postedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      },
      {
        id: "t3",
        platform: "instagram",
        caption:
          "Our 3-day coffee taster pass is back. Limited to 50 Elyon members.",
        reach: 9_210,
        clicks: 444,
        engagementRate: 0.093,
        author: "+256 701 ***238",
        postedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
      {
        id: "t4",
        platform: "whatsapp",
        caption:
          "Loan application workshop moved to Wednesday — reply with your business name.",
        reach: 5_720,
        clicks: 1_204,
        engagementRate: 0.21,
        author: "+256 757 ***332",
        postedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      },
      {
        id: "t5",
        platform: "youtube",
        caption: "Elyon pitch tips #3: telling your customer story in 60 sec.",
        reach: 6_030,
        clicks: 201,
        engagementRate: 0.061,
        author: "+256 704 ***885",
        postedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
    ],
    trendingHashtags: [
      { tag: "#MadeInUganda", platform: "instagram", uses: 64, reach: 21_400, deltaPct: 18 },
      { tag: "#KampalaEats", platform: "tiktok", uses: 49, reach: 41_900, deltaPct: 32 },
      { tag: "#ElyonMembers", platform: "facebook", uses: 38, reach: 12_800, deltaPct: 7 },
      { tag: "#ShopSmallUG", platform: "instagram", uses: 31, reach: 8_900, deltaPct: -4 },
      { tag: "#NakawaMarket", platform: "facebook", uses: 22, reach: 6_100, deltaPct: 12 },
      { tag: "#ReelsUganda", platform: "tiktok", uses: 19, reach: 16_300, deltaPct: 22 },
      { tag: "#BuyLocal", platform: "whatsapp", uses: 17, reach: 3_200, deltaPct: 3 },
      { tag: "#SMEug", platform: "x", uses: 12, reach: 2_800, deltaPct: -9 },
    ],
  },
  {
    id: "equity",
    name: "Equity SME Readiness",
    inviteCode: "EQUITY-SME",
    memberCount: 318,
    seatLimit: 1000,
    monthlyUgx: 5_000,
    annualUgx: 48_000,
    trendingPosts: [
      {
        id: "t1",
        platform: "linkedin",
        caption:
          "Equity SME loan walkthrough — Q&A with our credit team this Thursday 3pm.",
        reach: 7_430,
        clicks: 512,
        engagementRate: 0.069,
        author: "+256 772 ***144",
        postedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      },
      {
        id: "t2",
        platform: "facebook",
        caption:
          "Meet our top 5 SME graduates of April. Congratulations team 🎉",
        reach: 11_200,
        clicks: 308,
        engagementRate: 0.057,
        author: "+256 704 ***661",
        postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
      {
        id: "t3",
        platform: "whatsapp",
        caption: "Cohort 7 enrollment is now open. Tap the link to apply.",
        reach: 4_900,
        clicks: 1_102,
        engagementRate: 0.225,
        author: "+256 778 ***020",
        postedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      },
    ],
    trendingHashtags: [
      { tag: "#EquitySME", platform: "linkedin", uses: 41, reach: 12_600, deltaPct: 14 },
      { tag: "#SMEug", platform: "facebook", uses: 28, reach: 7_400, deltaPct: 9 },
      { tag: "#LoanReady", platform: "linkedin", uses: 18, reach: 4_900, deltaPct: 5 },
      { tag: "#Cohort7", platform: "whatsapp", uses: 14, reach: 2_100, deltaPct: 26 },
      { tag: "#KampalaBiz", platform: "instagram", uses: 12, reach: 3_300, deltaPct: -2 },
    ],
  },
];

const CLIENT_COLORS = [
  "#f5c842",
  "#39ff6a",
  "#ff7a3b",
  "#5ec5ff",
  "#d97aff",
  "#ff5b8a",
  "#6affc3",
];

const nextClientColor = (existing: Client[]): string => {
  const used = new Set(existing.map((c) => c.color));
  const free = CLIENT_COLORS.find((c) => !used.has(c));
  return free ?? CLIENT_COLORS[existing.length % CLIENT_COLORS.length];
};

/** Posts whose ids match this set are demo-seed posts that earlier
 *  versions of Posta auto-populated on first load. They were never
 *  pushed to Zernio (no `zernioPostId`) so they sit in /schedule
 *  forever as "overdue queued" rows that can never publish. Drop them
 *  on load so existing localStorage rows get cleaned up without
 *  forcing a full v2 → v3 schema bump (which would also wipe real
 *  user posts). */
const SEED_POST_IDS = new Set(["p1", "p2", "p3"]);

const dropSeedPosts = (posts: ScheduledPost[]): ScheduledPost[] =>
  posts.filter((p) => !SEED_POST_IDS.has(p.id));

const quotasFor = (
  plan: PlanId
): { posts: number | "unlimited"; accounts: number | "unlimited" } => {
  switch (plan) {
    case "free":
      return { posts: 5, accounts: 1 };
    case "starter":
      return { posts: 15, accounts: 2 };
    case "business":
      return { posts: 50, accounts: 5 };
    case "agency":
      return { posts: "unlimited", accounts: 15 };
    case "org":
      return { posts: 50, accounts: 5 };
  }
};

const LS_KEY = "posta-ug:v2";
const LS_KEY_LEGACY = "posta-ug:v1";

interface Persisted {
  user: User | null;
  posts: ScheduledPost[];
  accounts: ConnectedAccount[];
  clients: Client[];
  currentClientId: string | null;
  templates: PostTemplate[];
  recurringRules: RecurringRule[];
}

const loadPersisted = (): Persisted | null => {
  try {
    const raw =
      localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_LEGACY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      user: parsed.user ?? null,
      posts: parsed.posts ?? [],
      accounts: parsed.accounts ?? [],
      clients: parsed.clients ?? [],
      currentClientId: parsed.currentClientId ?? null,
      templates: parsed.templates ?? [],
      recurringRules: parsed.recurringRules ?? [],
    };
  } catch {
    return null;
  }
};

const rid = () => Math.random().toString(36).slice(2, 8);

type SetPostsFn = (updater: (prev: ScheduledPost[]) => ScheduledPost[]) => void;

/** Helper: push a scheduled post to Zernio when the user is in Real OAuth mode.
 *
 * Behavior:
 * - No-op if Zernio isn't configured or the OAuth mode isn't "real".
 * - If none of the selected platforms have a Zernio accountId linked, the
 *   post is marked failed with a clear reason (can be fixed by reconnecting
 *   the account on Onboarding).
 * - If only *some* selected platforms have a Zernio accountId, the post
 *   still gets pushed to Zernio for the valid subset and a non-fatal
 *   warning is stamped on the local post so /schedule can show "Posted to
 *   2 of 3 platforms… missing: whatsapp". This avoids silently dropping
 *   platforms while keeping the happy-path subset usable.
 * - On success, stamps `zernioPostId` on the local post.
 * - On Zernio error (4xx/5xx/network) including 409 duplicate-content,
 *   flips the local post to status="failed" with a `failureReason`
 *   surfaced in /schedule so the user can edit and retry.
 *
 * Media handling for the MVP: only items that already have a public https
 * URL are forwarded to Zernio. Local blob: / data: URLs from the composer are
 * skipped with a note in the failure reason, since Zernio needs a reachable
 * URL. Proper media upload is a separate follow-up.
 */
async function maybePublishToZernio(
  postId: string,
  p: Omit<ScheduledPost, "id" | "status">,
  accounts: ConnectedAccount[],
  setPosts: SetPostsFn
): Promise<void> {
  if (!zernioEnabled()) return;
  const oauthMode =
    typeof window !== "undefined"
      ? localStorage.getItem("posta-ug:oauth-mode")
      : null;
  if (oauthMode !== "real") return;

  const clientId = p.clientId ?? null;
  const scoped = accounts.filter((a) => (a.clientId ?? null) === clientId);
  const targets: PublishPlatform[] = [];
  const missing: Platform[] = [];
  for (const plat of p.platforms) {
    const acct = scoped.find((a) => a.platform === plat);
    if (!acct?.zernioAccountId) {
      missing.push(plat);
      continue;
    }
    targets.push({
      platform: ZERNIO_PLATFORM[plat],
      accountId: acct.zernioAccountId,
    });
  }

  if (targets.length === 0) {
    fail(
      setPosts,
      postId,
      `No Zernio-linked accounts for ${missing.join(", ") || "selected platforms"}. Reconnect on Onboarding.`
    );
    return;
  }

  const mediaItems: PublishMediaItem[] = [];
  let skippedLocalMedia = 0;
  for (const m of p.media ?? []) {
    if (m.publicUrl && /^https?:\/\//i.test(m.publicUrl)) {
      mediaItems.push({
        type: m.kind,
        url: m.publicUrl,
      });
    } else if (/^https?:\/\//i.test(m.dataUrl)) {
      // Legacy posts (pre-upload feature) stored the public URL in
      // dataUrl. Continue to honour that so old localStorage rows still
      // publish correctly.
      mediaItems.push({
        type: m.kind,
        url: m.dataUrl,
      });
    } else {
      // Compose blocks scheduling while uploads are in-flight or failed,
      // so this branch should be unreachable for fresh posts. Keep the
      // skip + warn behavior as a defensive backstop in case a stale
      // localStorage row from before the upload feature is replayed.
      skippedLocalMedia += 1;
    }
  }

  const result = await publishPost({
    content: p.text,
    platforms: targets,
    // publishNow takes precedence over scheduledFor — Zernio rejects sending
    // both, and "publish immediately" means we should not pass a scheduled
    // timestamp at all (otherwise Zernio queues it for that exact moment
    // instead of firing now).
    ...(p.publishNow
      ? { publishNow: true }
      : { scheduledFor: p.scheduledAt }),
    mediaItems: mediaItems.length ? mediaItems : undefined,
  });

  if (result.kind === "ok") {
    // Non-fatal warnings: stamped into failureReason even though status
    // stays "queued". /schedule shows them in yellow on the queued card.
    const warnings: string[] = [];
    if (missing.length > 0) {
      warnings.push(
        `Posted to ${targets.length} of ${p.platforms.length} platforms. No Zernio accounts for: ${missing.join(", ")}.`
      );
    }
    if (skippedLocalMedia > 0) {
      warnings.push(
        `Posted without ${skippedLocalMedia} local file(s). Upload media with public URLs to include them.`
      );
    }
    setPosts((xs) =>
      xs.map((x) =>
        x.id === postId
          ? {
              ...x,
              zernioPostId: result.zernioPostId,
              ...(warnings.length > 0
                ? { failureReason: warnings.join(" ") }
                : {}),
            }
          : x
      )
    );
    return;
  }

  if (result.kind === "duplicate") {
    fail(setPosts, postId, `Zernio: ${result.message} Edit the text and retry.`);
    return;
  }

  if (missing.length > 0) {
    fail(
      setPosts,
      postId,
      `Zernio: ${result.message}. Missing accounts for: ${missing.join(", ")}.`
    );
    return;
  }

  fail(setPosts, postId, `Zernio: ${result.message}`);
}

/** Merge Zernio's upstream post status + per-post analytics into a local
 *  ScheduledPost. Handles all upstream status variants and surfaces
 *  platform-level failures with readable reasons (e.g.
 *  "Failed on instagram: rate limited"). On analytics 402 / errors leaves
 *  reach/clicks untouched so seeded numbers stay as a fallback. */
function applyZernioStatus(
  local: ScheduledPost,
  status: Awaited<ReturnType<typeof getPostStatus>>,
  analytics: Awaited<ReturnType<typeof getPostAnalytics>>
): ScheduledPost {
  const next: ScheduledPost = { ...local };

  if (status.kind === "ok") {
    const { post } = status;
    const platforms = post.platforms ?? [];
    const failedPlats = platforms.filter((x) => x.status === "failed");
    const publishedPlats = platforms.filter((x) => x.status === "published");

    if (post.status === "published") {
      next.status = "sent";
      // Preserve any pre-existing informational warning (e.g. the
      // "Posted without N local file(s)" stamp from maybePublishToZernio)
      // when Zernio confirms the post published cleanly.
      next.failureReason =
        failedPlats.length > 0
          ? summarizeFailures(failedPlats)
          : local.failureReason;
    } else if (post.status === "partial") {
      // Some platforms published, some failed — keep the post as "sent"
      // but stamp the per-platform failure reason.
      next.status = publishedPlats.length > 0 ? "sent" : "failed";
      next.failureReason = summarizeFailures(failedPlats);
    } else if (post.status === "failed") {
      next.status = "failed";
      next.failureReason =
        summarizeFailures(failedPlats) ||
        next.failureReason ||
        "Zernio reported the post as failed.";
    }
    // "scheduled" / "draft" / unknown → leave local status alone.
  }
  // status.kind === "not_found" | "error" → leave local state alone so a
  // transient network blip doesn't flip a real "sent" post back to "queued".

  if (analytics.kind === "ok" && next.status === "sent") {
    next.reach = analytics.reach ?? next.reach;
    next.clicks = analytics.clicks ?? next.clicks;
  }

  return next;
}

function summarizeFailures(failed: ZernioPlatformResult[]): string | undefined {
  if (failed.length === 0) return undefined;
  const parts = failed.map(
    (f) => `${f.platform}${f.error ? `: ${f.error}` : ""}`
  );
  return `Failed on ${parts.join("; ")}`;
}

function fail(setPosts: SetPostsFn, id: string, reason: string): void {
  setPosts((xs) =>
    xs.map((x) =>
      x.id === id ? { ...x, status: "failed" as const, failureReason: reason } : x
    )
  );
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const persisted = typeof window !== "undefined" ? loadPersisted() : null;

  const [user, setUser] = useState<User | null>(persisted?.user ?? null);
  const [posts, setPosts] = useState<ScheduledPost[]>(
    dropSeedPosts(persisted?.posts ?? [])
  );
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    persisted?.accounts ?? []
  );
  const [clients, setClients] = useState<Client[]>(persisted?.clients ?? []);
  const [currentClientId, setCurrentClientId] = useState<string | null>(
    persisted?.currentClientId ?? null
  );
  const [templates, setTemplates] = useState<PostTemplate[]>(
    persisted?.templates ?? []
  );
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>(
    persisted?.recurringRules ?? []
  );
  const [orgs] = useState<Org[]>(SEED_ORGS);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          user,
          posts,
          accounts,
          clients,
          currentClientId,
          templates,
          recurringRules,
        } as Persisted)
      );
    } catch {
      /* ignore */
    }
  }, [user, posts, accounts, clients, currentClientId, templates, recurringRules]);

  const api: AppState = useMemo(
    () => ({
      user,
      posts,
      accounts,
      orgs,
      clients,
      currentClientId,
      signup(name, phone, plan, orgId, billingCycle) {
        const q = quotasFor(plan);
        setUser({
          name,
          phone,
          plan,
          billingCycle: billingCycle ?? "monthly",
          orgId,
          postsUsed: 0,
          postsQuota: q.posts,
          accountsQuota: q.accounts,
        });
        // Fresh signup starts from a clean slate: no stale accounts / posts /
        // clients / templates carried over from a previous user on the same
        // device. Important on shared devices (common in Uganda) where the
        // previous user's caption templates would otherwise leak through.
        setAccounts([]);
        setPosts([]);
        setTemplates([]);
        setRecurringRules([]);
        if (plan === "agency") {
          const starter: Client = {
            id: "c" + rid(),
            name: "My first client",
            color: CLIENT_COLORS[0],
            createdAt: new Date().toISOString(),
          };
          setClients([starter]);
          setCurrentClientId(starter.id);
        } else {
          setClients([]);
          setCurrentClientId(null);
        }
      },
      login(phone) {
        if (user && user.phone === phone) return true;
        const q = quotasFor("business");
        setUser({
          name: phone.slice(-4),
          phone,
          plan: "business",
          billingCycle: "monthly",
          postsUsed: 8,
          postsQuota: q.posts,
          accountsQuota: q.accounts,
        });
        return true;
      },
      logout() {
        setUser(null);
      },
      connectAccount(platform, handle, clientId, zernioAccountId) {
        setAccounts((a) => [
          ...a.filter(
            (x) =>
              !(x.platform === platform && (x.clientId ?? null) === (clientId ?? null))
          ),
          {
            platform,
            handle,
            connectedAt: new Date().toISOString(),
            clientId,
            zernioAccountId,
          },
        ]);
      },
      disconnectAccount(platform, clientId) {
        setAccounts((a) =>
          a.filter(
            (x) =>
              !(x.platform === platform && (x.clientId ?? null) === (clientId ?? null))
          )
        );
      },
      schedulePost(p) {
        const id = "p" + rid();
        const needsApproval = user?.plan === "agency";
        const initialStatus: PostStatus = needsApproval
          ? "pending_approval"
          : "queued";
        setPosts((xs) => [
          ...xs,
          { ...p, id, status: initialStatus },
        ]);
        setUser((u) => (u ? { ...u, postsUsed: u.postsUsed + 1 } : u));

        // Fire-and-forget: push to Zernio when Real OAuth mode is on.
        // Skip the push for Agency approval-gated posts; approvePost()
        // re-evaluates and sends once an approver flips the status.
        if (!needsApproval) {
          void maybePublishToZernio(id, p, accounts, setPosts);
        }
      },
      approvePost(id) {
        setPosts((xs) =>
          xs.map((p) => (p.id === id ? { ...p, status: "queued" } : p))
        );
        // Once approved, push to Zernio. The scope here is the full posts
        // array closure — find the post snapshot and retry.
        const p = posts.find((x) => x.id === id);
        if (p) void maybePublishToZernio(id, p, accounts, setPosts);
      },
      pushPostToZernio(id) {
        const p = posts.find((x) => x.id === id);
        if (!p) return;
        // Already linked to a Zernio post — nothing to push. The user
        // should be using Edit instead to mutate it upstream.
        if (p.zernioPostId) return;
        // Reset any prior failure stamp so the card UI clears the warning
        // pill while the retry is in flight; maybePublishToZernio will
        // re-stamp on its own outcome.
        setPosts((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, status: "queued", failureReason: undefined }
              : x
          )
        );
        void maybePublishToZernio(id, p, accounts, setPosts);
      },
      async cancelPost(id) {
        const target = posts.find((x) => x.id === id);
        const zid = target?.zernioPostId;
        // Optimistically remove from the local list — the user already
        // tapped Cancel/Remove and we don't want them staring at the row
        // while Render cold-starts. If Zernio rejects the delete (e.g.
        // post already published), surface a transient warning but leave
        // the post removed locally; the next syncPostStatuses() poll on a
        // surviving zernioPostId would have flipped it to sent anyway.
        setPosts((xs) => xs.filter((x) => x.id !== id));
        if (zid && zernioEnabled()) {
          const result = await deletePost(zid);
          if (result.kind === "error" || result.kind === "too_late") {
            // Best-effort: log so we have something in dev tools when a
            // user reports "I cancelled but the post still went out".
            console.warn(
              "[posta] Zernio cancel failed",
              result.kind,
              "message" in result ? result.message : undefined
            );
          }
        }
      },
      async editPost(id, patch) {
        const target = posts.find((x) => x.id === id);
        if (!target) return "error";

        const nextText = patch.text ?? target.text;
        const nextScheduledAt = patch.scheduledAt ?? target.scheduledAt;
        const zid = target.zernioPostId;

        if (zid && zernioEnabled()) {
          // Build the upstream patch with only the fields that actually
          // changed — Zernio rejects edits that aren't allowed (e.g.
          // scheduledFor in the past) so don't send fields the user
          // didn't touch.
          const body: { content?: string; scheduledFor?: string } = {};
          if (patch.text !== undefined && patch.text !== target.text) {
            body.content = nextText;
          }
          if (
            patch.scheduledAt !== undefined &&
            patch.scheduledAt !== target.scheduledAt
          ) {
            body.scheduledFor = nextScheduledAt;
          }
          // Nothing actually changed — treat as no-op. Use Object.keys
          // instead of !body.content because clearing the post text to
          // an empty string is a legitimate edit, not a no-op.
          if (Object.keys(body).length === 0) return "ok";

          const result = await updatePost(zid, body);
          if (result.kind === "ok") {
            setPosts((xs) =>
              xs.map((x) =>
                x.id === id
                  ? { ...x, text: nextText, scheduledAt: nextScheduledAt }
                  : x
              )
            );
            return "ok";
          }
          if (result.kind === "too_late") return "too_late";
          // not_found upstream means we're out of sync; clear the local
          // zernioPostId so the user can retry as a fresh publish.
          if (result.kind === "not_found") {
            setPosts((xs) =>
              xs.map((x) =>
                x.id === id ? { ...x, zernioPostId: undefined } : x
              )
            );
            return "error";
          }
          return "error";
        }

        // Mock mode — just update locally. Caller can show "Saved".
        setPosts((xs) =>
          xs.map((x) =>
            x.id === id
              ? { ...x, text: nextText, scheduledAt: nextScheduledAt }
              : x
          )
        );
        return "ok_local_only";
      },
      markPostFailed(id, reason) {
        setPosts((xs) =>
          xs.map((p) =>
            p.id === id ? { ...p, status: "failed", failureReason: reason } : p
          )
        );
      },
      setPostZernioId(id, zernioPostId) {
        setPosts((xs) =>
          xs.map((p) => (p.id === id ? { ...p, zernioPostId } : p))
        );
      },
      async syncPostStatuses() {
        if (!zernioEnabled()) return;
        // Only poll posts that are (a) linked to Zernio, (b) not in a
        // terminal-for-this-session state (failed stays failed; sent posts
        // can still have analytics arrive late, so we keep re-polling them).
        const targets = posts.filter(
          (p) =>
            p.zernioPostId &&
            p.status !== "failed" &&
            p.status !== "draft" &&
            p.status !== "pending_approval"
        );
        if (targets.length === 0) return;

        await Promise.all(
          targets.map(async (p) => {
            const id = p.id;
            const zid = p.zernioPostId!;
            const [status, analytics] = await Promise.all([
              getPostStatus(zid),
              getPostAnalytics(zid),
            ]);
            setPosts((xs) =>
              xs.map((x) => (x.id === id ? applyZernioStatus(x, status, analytics) : x))
            );
          })
        );
      },
      topUpPosts(count) {
        setUser((u) => {
          if (!u) return u;
          if (u.postsQuota === "unlimited") return u;
          return { ...u, postsQuota: (u.postsQuota as number) + count };
        });
      },
      lookupOrg(code) {
        const c = code.trim().toUpperCase();
        return orgs.find((o) => o.inviteCode.toUpperCase() === c);
      },
      setPlan(plan, billingCycle = "monthly") {
        setUser((u) => {
          if (!u) return u;
          const q = quotasFor(plan);
          return {
            ...u,
            plan,
            billingCycle,
            postsQuota: q.posts,
            accountsQuota: q.accounts,
          };
        });
      },
      addClient(name) {
        const c: Client = {
          id: "c" + rid(),
          name: name.trim() || "Untitled client",
          color: nextClientColor(clients),
          createdAt: new Date().toISOString(),
        };
        setClients((xs) => [...xs, c]);
        setCurrentClientId(c.id);
        return c;
      },
      renameClient(id, name) {
        setClients((xs) =>
          xs.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c))
        );
      },
      removeClient(id) {
        setClients((xs) => xs.filter((c) => c.id !== id));
        setAccounts((a) => a.filter((x) => x.clientId !== id));
        setPosts((xs) => xs.filter((p) => p.clientId !== id));
        // Cascade to recurring rules too — otherwise an orphaned rule
        // stays around in "all clients" view and Resume would
        // materialize posts with a dangling clientId invisible in
        // scoped views.
        setRecurringRules((xs) => xs.filter((r) => r.clientId !== id));
        setCurrentClientId((cur) => (cur === id ? null : cur));
      },
      selectClient(id) {
        setCurrentClientId(id);
      },
      setUserZernioProfileId(profileId) {
        setUser((u) => (u ? { ...u, zernioProfileId: profileId } : u));
      },
      setClientZernioProfileId(clientId, profileId) {
        setClients((xs) =>
          xs.map((c) => (c.id === clientId ? { ...c, zernioProfileId: profileId } : c))
        );
      },
      templates,
      addTemplate({ name, text, kind }) {
        const now = new Date().toISOString();
        const t: PostTemplate = {
          id: "tpl_" + rid(),
          name: name.trim() || "Untitled",
          text,
          kind,
          createdAt: now,
          updatedAt: now,
        };
        setTemplates((xs) => [...xs, t]);
        return t;
      },
      updateTemplate(id, patch) {
        const now = new Date().toISOString();
        setTemplates((xs) =>
          xs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...patch,
                  // Don't let a rename collapse an empty string into ""
                  // by accident — fall back to the existing name. Empty
                  // text is fine (user might be saving a placeholder
                  // template they'll fill in later).
                  name:
                    patch.name !== undefined
                      ? patch.name.trim() || t.name
                      : t.name,
                  updatedAt: now,
                }
              : t
          )
        );
      },
      removeTemplate(id) {
        setTemplates((xs) => xs.filter((t) => t.id !== id));
      },
      recurringRules,
      addRecurringRule(input) {
        const now = new Date().toISOString();
        const rule: RecurringRule = {
          id: "rr_" + rid(),
          name:
            (input.name ?? "").trim() ||
            input.text.trim().split(/\s+/).slice(0, 4).join(" ") ||
            "Recurring post",
          clientId: input.clientId,
          text: input.text,
          kind: input.kind,
          platforms: input.platforms,
          media: input.media,
          cadence: input.cadence,
          timeOfDay: input.timeOfDay,
          startDate: input.startDate,
          endBy: input.endBy,
          paused: false,
          createdAt: now,
          updatedAt: now,
        };

        // Compute before persisting — if the start + end window yields
        // zero occurrences, skip the rule entirely so Settings doesn't
        // show an orphaned row the user has to clean up manually.
        const occurrences = computeOccurrences(rule);
        if (occurrences.length === 0) {
          return { rule, scheduled: 0 };
        }
        setRecurringRules((xs) => [...xs, rule]);

        const needsApproval = user?.plan === "agency";
        const initialStatus: PostStatus = needsApproval
          ? "pending_approval"
          : "queued";
        const materialized: ScheduledPost[] = occurrences.map((iso) => ({
          id: "p" + rid(),
          text: input.text,
          kind: input.kind,
          platforms: input.platforms,
          scheduledAt: iso,
          status: initialStatus,
          media: input.media,
          clientId: input.clientId,
          recurringRuleId: rule.id,
        }));
        setPosts((xs) => [...xs, ...materialized]);
        setUser((u) =>
          u ? { ...u, postsUsed: u.postsUsed + materialized.length } : u
        );

        // Push each occurrence to Zernio when in Real OAuth mode. Skip the
        // push for approval-gated Agency posts; approvePost() handles that
        // once someone flips the status.
        if (!needsApproval) {
          for (const occ of materialized) {
            void maybePublishToZernio(
              occ.id,
              {
                text: occ.text,
                kind: occ.kind,
                platforms: occ.platforms,
                scheduledAt: occ.scheduledAt,
                media: occ.media,
                clientId: occ.clientId,
                recurringRuleId: occ.recurringRuleId,
              },
              accounts,
              setPosts
            );
          }
        }

        return { rule, scheduled: materialized.length };
      },
      async pauseRecurringRule(id) {
        const rule = recurringRules.find((r) => r.id === id);
        if (!rule || rule.paused) return;
        setRecurringRules((xs) =>
          xs.map((r) =>
            r.id === id ? { ...r, paused: true, updatedAt: new Date().toISOString() } : r
          )
        );
        await cancelFutureOccurrencesForRule(id, posts, setPosts);
      },
      resumeRecurringRule(id) {
        const rule = recurringRules.find((r) => r.id === id);
        if (!rule || !rule.paused) return;
        const resumed: RecurringRule = {
          ...rule,
          paused: false,
          updatedAt: new Date().toISOString(),
        };
        setRecurringRules((xs) => xs.map((r) => (r.id === id ? resumed : r)));

        // Re-materialize any missing future occurrences. We match on
        // (recurringRuleId, scheduledAt) so resuming twice is idempotent.
        const existing = new Set(
          posts
            .filter((p) => p.recurringRuleId === id)
            .map((p) => p.scheduledAt)
        );
        const future = computeOccurrences(resumed).filter((iso) => !existing.has(iso));
        if (future.length === 0) return;

        const needsApproval = user?.plan === "agency";
        const initialStatus: PostStatus = needsApproval
          ? "pending_approval"
          : "queued";
        const materialized: ScheduledPost[] = future.map((iso) => ({
          id: "p" + rid(),
          text: resumed.text,
          kind: resumed.kind,
          platforms: resumed.platforms,
          scheduledAt: iso,
          status: initialStatus,
          media: resumed.media,
          clientId: resumed.clientId,
          recurringRuleId: resumed.id,
        }));
        setPosts((xs) => [...xs, ...materialized]);
        setUser((u) =>
          u ? { ...u, postsUsed: u.postsUsed + materialized.length } : u
        );
        if (!needsApproval) {
          for (const occ of materialized) {
            void maybePublishToZernio(
              occ.id,
              {
                text: occ.text,
                kind: occ.kind,
                platforms: occ.platforms,
                scheduledAt: occ.scheduledAt,
                media: occ.media,
                clientId: occ.clientId,
                recurringRuleId: occ.recurringRuleId,
              },
              accounts,
              setPosts
            );
          }
        }
      },
      async removeRecurringRule(id) {
        await cancelFutureOccurrencesForRule(id, posts, setPosts);
        setRecurringRules((xs) => xs.filter((r) => r.id !== id));
      },
    }),
    [user, posts, accounts, orgs, clients, currentClientId, templates, recurringRules]
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppStateProvider missing");
  return ctx;
}

export const isAgency = (planId?: PlanId | null) => planId === "agency";

export function scopeAccounts(
  accounts: ConnectedAccount[],
  planId: PlanId | undefined,
  clientId: string | null
): ConnectedAccount[] {
  if (!isAgency(planId)) return accounts.filter((a) => !a.clientId);
  if (clientId === null) return accounts;
  return accounts.filter((a) => a.clientId === clientId);
}

/**
 * Generate the ISO-timestamp list for every occurrence a recurring rule
 * produces, up to its `endBy` cap. Occurrences in the past relative to
 * "now" are skipped so Zernio never receives a scheduledFor before its
 * own clock (it would 400). Defensive hard caps per cadence type prevent
 * a misconfigured rule (e.g. endBy.count = 100000) from flooding
 * localStorage.
 */
export function computeOccurrences(rule: RecurringRule): string[] {
  const [hh, mm] = rule.timeOfDay.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return [];
  const start = parseLocalDate(rule.startDate);
  if (!start) return [];

  const endDateCap =
    rule.endBy.type === "date" ? parseLocalDate(rule.endBy.date) : null;
  const countCap =
    rule.endBy.type === "count" ? Math.max(0, rule.endBy.count) : Infinity;

  // Hard per-cadence safety cap so misconfigured rules never generate
  // thousands of posts. Iteration walks day-by-day, so we need enough
  // headroom to cover the deepest cadence the UI allows: monthly with
  // count=24 needs ~24 * 31 = 744 iterations. 1100 gives comfortable
  // headroom (covers ~3 years of daily posts too).
  const SAFETY_ITERATIONS = 1100;

  const out: string[] = [];
  const now = Date.now();
  const cursor = new Date(start);
  cursor.setHours(hh, mm, 0, 0);

  for (let i = 0; i < SAFETY_ITERATIONS && out.length < countCap; i++) {
    if (endDateCap && cursor.getTime() > endDateCap.getTime() + 24 * 3600_000) {
      break;
    }
    let matches = false;
    switch (rule.cadence.type) {
      case "daily":
        matches = true;
        break;
      case "weekly":
        matches = rule.cadence.weekdays.includes(cursor.getDay());
        break;
      case "monthly":
        matches = cursor.getDate() === Math.min(28, rule.cadence.dayOfMonth);
        break;
    }
    if (matches && cursor.getTime() >= now) {
      out.push(toLocalIso(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(hh, mm, 0, 0);
  }
  return out;
}

function parseLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [, y, mo, d] = m;
  const out = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

function toLocalIso(d: Date): string {
  // Produce a naive local "datetime-local" style string — Zernio accepts
  // it the same way the single-post datetime-local input does.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Cancel every future occurrence tied to a rule. Past (already-sent
 * or already-past-scheduledAt) posts stay so the user keeps their
 * history; future queued ones are removed locally + best-effort
 * deleted from Zernio.
 */
async function cancelFutureOccurrencesForRule(
  ruleId: string,
  posts: ScheduledPost[],
  setPosts: React.Dispatch<React.SetStateAction<ScheduledPost[]>>
): Promise<void> {
  const now = Date.now();
  const futureIds = posts
    .filter(
      (p) =>
        p.recurringRuleId === ruleId &&
        (p.status === "queued" || p.status === "pending_approval") &&
        new Date(p.scheduledAt).getTime() > now
    )
    .map((p) => p.id);
  if (futureIds.length === 0) return;

  const zernioIds = posts
    .filter((p) => futureIds.includes(p.id) && p.zernioPostId)
    .map((p) => p.zernioPostId as string);

  setPosts((xs) => xs.filter((p) => !futureIds.includes(p.id)));

  if (zernioIds.length > 0 && zernioEnabled()) {
    await Promise.all(
      zernioIds.map(async (zid) => {
        const result = await deletePost(zid);
        if (result.kind === "error" || result.kind === "too_late") {
          console.warn(
            "[posta] recurring: Zernio cancel failed",
            result.kind,
            "message" in result ? result.message : undefined
          );
        }
      })
    );
  }
}

export function scopePosts(
  posts: ScheduledPost[],
  planId: PlanId | undefined,
  clientId: string | null
): ScheduledPost[] {
  if (!isAgency(planId)) return posts.filter((p) => !p.clientId);
  if (clientId === null) return posts;
  return posts.filter((p) => p.clientId === clientId);
}
