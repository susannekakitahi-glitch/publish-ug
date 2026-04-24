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

export interface ScheduledPost {
  id: string;
  text: string;
  kind: "status" | "photo" | "carousel" | "video" | "youtube";
  platforms: Platform[];
  scheduledAt: string;
  status: "queued" | "sent" | "failed" | "draft";
  media?: MediaItem[];
  reach?: number;
  clicks?: number;
}

export interface ConnectedAccount {
  platform: Platform;
  handle: string;
  connectedAt: string;
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
  signup: (name: string, phone: string, plan: PlanId, orgId?: string) => void;
  login: (phone: string) => boolean;
  logout: () => void;
  connectAccount: (platform: Platform, handle: string) => void;
  disconnectAccount: (platform: Platform) => void;
  schedulePost: (p: Omit<ScheduledPost, "id" | "status">) => void;
  cancelPost: (id: string) => void;
  topUpPosts: (count: number) => void;
  lookupOrg: (code: string) => Org | undefined;
  setPlan: (plan: PlanId, billingCycle?: "monthly" | "annual") => void;
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

const LS_KEY = "posta-ug:v1";

interface Persisted {
  user: User | null;
  posts: ScheduledPost[];
  accounts: ConnectedAccount[];
}

const loadPersisted = (): Persisted | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const persisted = typeof window !== "undefined" ? loadPersisted() : null;

  const [user, setUser] = useState<User | null>(persisted?.user ?? null);
  const [posts, setPosts] = useState<ScheduledPost[]>(
    persisted?.posts ?? seedPosts()
  );
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    persisted?.accounts ?? []
  );
  const [orgs] = useState<Org[]>(SEED_ORGS);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ user, posts, accounts } as Persisted)
      );
    } catch {
      /* ignore */
    }
  }, [user, posts, accounts]);

  const api: AppState = useMemo(
    () => ({
      user,
      posts,
      accounts,
      orgs,
      signup(name, phone, plan, orgId) {
        const q = quotasFor(plan);
        setUser({
          name,
          phone,
          plan,
          billingCycle: "monthly",
          orgId,
          postsUsed: 0,
          postsQuota: q.posts,
          accountsQuota: q.accounts,
        });
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
      connectAccount(platform, handle) {
        setAccounts((a) => [
          ...a.filter((x) => x.platform !== platform),
          { platform, handle, connectedAt: new Date().toISOString() },
        ]);
      },
      disconnectAccount(platform) {
        setAccounts((a) => a.filter((x) => x.platform !== platform));
      },
      schedulePost(p) {
        const id = "p" + Math.random().toString(36).slice(2, 8);
        setPosts((xs) => [...xs, { ...p, id, status: "queued" }]);
        setUser((u) => (u ? { ...u, postsUsed: u.postsUsed + 1 } : u));
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
    }),
    [user, posts, accounts, orgs]
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppStateProvider missing");
  return ctx;
}
