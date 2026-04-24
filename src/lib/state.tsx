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
}

export interface ConnectedAccount {
  platform: Platform;
  handle: string;
  connectedAt: string;
  clientId?: string;
}

export interface Org {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  seatLimit: number;
  monthlyUgx: number;
  annualUgx: number;
}

export interface Client {
  id: string;
  name: string;
  color: string;
  createdAt: string;
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
    clientId?: string
  ) => void;
  disconnectAccount: (platform: Platform, clientId?: string) => void;
  schedulePost: (p: Omit<ScheduledPost, "id" | "status">) => void;
  approvePost: (id: string) => void;
  cancelPost: (id: string) => void;
  topUpPosts: (count: number) => void;
  lookupOrg: (code: string) => Org | undefined;
  setPlan: (plan: PlanId, billingCycle?: "monthly" | "annual") => void;
  addClient: (name: string) => Client;
  renameClient: (id: string, name: string) => void;
  removeClient: (id: string) => void;
  selectClient: (id: string | null) => void;
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
  },
  {
    id: "equity",
    name: "Equity SME Readiness",
    inviteCode: "EQUITY-SME",
    memberCount: 318,
    seatLimit: 1000,
    monthlyUgx: 5_000,
    annualUgx: 48_000,
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
      connectAccount(platform, handle, clientId) {
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
        setPosts((xs) => [
          ...xs,
          {
            ...p,
            id,
            status: needsApproval ? "pending_approval" : "queued",
          },
        ]);
        setUser((u) => (u ? { ...u, postsUsed: u.postsUsed + 1 } : u));
      },
      approvePost(id) {
        setPosts((xs) =>
          xs.map((p) => (p.id === id ? { ...p, status: "queued" } : p))
        );
      },
      cancelPost(id) {
        setPosts((xs) => xs.filter((x) => x.id !== id));
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
