export type PlanId = "free" | "starter" | "business" | "agency" | "org";

export interface PostPack {
  label: string;
  posts?: number;
  priceUgx: number;
  extra?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyUgx: number;
  annualUgx?: number;
  socialAccounts: number | "unlimited";
  monthlyPosts: number | "unlimited";
  teamSeats: number;
  features: string[];
  packs: PostPack[];
  hidden?: boolean;
  recommended?: boolean;
}

export const UGX = (n: number) => "UGX " + n.toLocaleString("en-UG");

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try it out",
    monthlyUgx: 0,
    socialAccounts: 1,
    monthlyPosts: 5,
    teamSeats: 1,
    features: [
      "1 social account",
      "5 scheduled posts / month",
      "Visual calendar",
      "Basic analytics",
    ],
    packs: [],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For individuals & micro-entrepreneurs",
    monthlyUgx: 10_000,
    socialAccounts: 2,
    monthlyPosts: 15,
    teamSeats: 1,
    features: [
      "2 social accounts",
      "15 scheduled posts / month",
      "Photo, carousel, short video",
      "MoMo / Airtel Money billing",
    ],
    packs: [{ label: "10-post pack", posts: 10, priceUgx: 5_000 }],
  },
  {
    id: "business",
    name: "Business",
    tagline: "For small business owners (the core)",
    monthlyUgx: 50_000,
    socialAccounts: 5,
    monthlyPosts: 50,
    teamSeats: 2,
    recommended: true,
    features: [
      "5 social accounts",
      "50 scheduled posts / month",
      "All content types incl. Reels / Shorts",
      "AI caption suggestions",
      "Clicks-to-number tracking",
    ],
    packs: [
      { label: "10-post pack", posts: 10, priceUgx: 4_000 },
      { label: "Report download", priceUgx: 3_000, extra: "per report" },
    ],
  },
  {
    id: "agency",
    name: "Agency",
    tagline: "For agencies & multi-location brands",
    monthlyUgx: 150_000,
    socialAccounts: 15,
    monthlyPosts: "unlimited",
    teamSeats: 3,
    features: [
      "15 social accounts",
      "Unlimited scheduled posts",
      "3 team seats",
      "Client approval workflows",
      "White-label report packs",
    ],
    packs: [
      { label: "5-seat pack", priceUgx: 50_000 },
      { label: "5-report pack", priceUgx: 25_000 },
    ],
  },
  {
    id: "org",
    name: "Org (by invite)",
    tagline: "Discounted per-member plan for banks, co-ops & partner orgs",
    monthlyUgx: 5_000,
    annualUgx: 48_000,
    socialAccounts: 3,
    monthlyPosts: 30,
    teamSeats: 1,
    hidden: true,
    features: [
      "UGX 5,000 / member / month (or 48,000 / year — 2 months free)",
      "3 social accounts · 30 posts / month",
      "Individual MoMo billing per member",
      "Up to 1,000 members per org",
      "Org admin console & seat usage dashboard",
    ],
    packs: [],
  },
];

export const getPlan = (id: PlanId) => PLANS.find((p) => p.id === id)!;

export const PUBLIC_PLANS = PLANS.filter((p) => !p.hidden);
