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
  getPostAnalytics,
  getPostStatus,
  publishPost,
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
  dataUrl: string;
  size: number;
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
  cancelPost: (id: string) => void;
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

const seedPosts = (): ScheduledPost[] => {
  const now = Date.now();
  const hr = 3_600_000;
  const d = 24 * hr;
  return [
    {
      id: "p1",
      text: "Fresh stock in store today — come by Ntinda before 6pm.",
      kind: "photo",
      platforms: ["facebook", "instagram", "whatsapp"],
      scheduledAt: new Date(now + 3 * hr).toISOString(),
      status: "queued",
    },
    {
      id: "p2",
      text: "Weekend special: buy 2 get 1 free on all beverages.",
      kind: "carousel",
      platforms: ["facebook", "instagram"],
      scheduledAt: new Date(now + 1 * d + 4 * hr).toISOString(),
      status: "queued",
    },
    {
      id: "p3",
      text: "Behind the scenes at our morning shoot.",
      kind: "video",
      platforms: ["tiktok", "youtube", "instagram"],
      scheduledAt: new Date(now - 1 * d).toISOString(),
      status: "sent",
      reach: 2140,
      clicks: 57,
    },
  ];
};

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
    };
  } catch {
    return null;
  }
};

const rid = () => Math.random().toString(36).slice(2, 8);

type SetPostsFn = (updater: (prev: ScheduledPost[]) => ScheduledPost[]) => void;

/** Helper: push a scheduled post to Zernio when the user is in Real OAuth mode.
 *
 * - No-op if Zernio isn't configured, mode isn't "real", or any selected
 *   platform is missing a Zernio accountId on the ConnectedAccount record
 *   (happens when the user toggled Real mode mid-flight without re-syncing).
 * - On success, stamps `zernioPostId` on the local post.
 * - On Zernio error (4xx/5xx/network), flips the local post to status="failed"
 *   with a `failureReason` surfaced in /schedule so the user can retry.
 * - On 409 (duplicate content within 24h), also marks as failed so the user
 *   can edit + reschedule.
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
    if (/^https?:\/\//i.test(m.dataUrl)) {
      mediaItems.push({
        type: m.kind,
        url: m.dataUrl,
      });
    } else {
      skippedLocalMedia += 1;
    }
  }

  const result = await publishPost({
    content: p.text,
    platforms: targets,
    scheduledFor: p.scheduledAt,
    mediaItems: mediaItems.length ? mediaItems : undefined,
  });

  if (result.kind === "ok") {
    setPosts((xs) =>
      xs.map((x) =>
        x.id === postId ? { ...x, zernioPostId: result.zernioPostId } : x
      )
    );
    if (skippedLocalMedia > 0) {
      // Non-fatal: the post went to Zernio but without attached media.
      // Keep status=queued but record a note in failureReason so the UI
      // can show a small inline warning.
      setPosts((xs) =>
        xs.map((x) =>
          x.id === postId
            ? {
                ...x,
                failureReason: `Posted without ${skippedLocalMedia} local file(s). Upload media with public URLs to include them.`,
              }
            : x
        )
      );
    }
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
      next.failureReason =
        failedPlats.length > 0
          ? summarizeFailures(failedPlats)
          : undefined;
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
    next.reach = analytics.reach || next.reach;
    next.clicks = analytics.clicks || next.clicks;
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
    persisted?.posts && persisted.posts.length > 0
      ? persisted.posts
      : seedPosts()
  );
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    persisted?.accounts ?? []
  );
  const [clients, setClients] = useState<Client[]>(persisted?.clients ?? []);
  const [currentClientId, setCurrentClientId] = useState<string | null>(
    persisted?.currentClientId ?? null
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
        } as Persisted)
      );
    } catch {
      /* ignore */
    }
  }, [user, posts, accounts, clients, currentClientId]);

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
        // clients carried over from a previous user on the same device.
        setAccounts([]);
        setPosts(seedPosts());
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
      cancelPost(id) {
        setPosts((xs) => xs.filter((x) => x.id !== id));
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
    }),
    [user, posts, accounts, orgs, clients, currentClientId]
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

export function scopePosts(
  posts: ScheduledPost[],
  planId: PlanId | undefined,
  clientId: string | null
): ScheduledPost[] {
  if (!isAgency(planId)) return posts.filter((p) => !p.clientId);
  if (clientId === null) return posts;
  return posts.filter((p) => p.clientId === clientId);
}
