/**
 * Posta tier shape.
 *
 * Re-costed against Zernio's new pay-per-account model
 * (https://zernio.com/pricing): first 2 accounts free across the whole
 * Posta API key, then $6/account for accounts 3-10, $3 for 11-100,
 * $1 for 101-2,000.
 *
 * At Posta's expected steady-state scale (>10 connected accounts
 * across all tenants) the marginal Zernio cost is roughly $3/acct/mo
 * (~UGX 11,400 at 3,800 UGX / USD). Tiers are sized so each paid
 * tier covers its baked-in account allowance with a healthy gross
 * margin, and any user who needs more accounts than their tier
 * allows can buy a per-account top-up at our cost-plus rate instead
 * of being forced to jump tiers.
 *
 *   Tier      | Accts | Posts/mo  | Price (UGX) | Zernio cost | Margin
 *   ----------+-------+-----------+-------------+-------------+--------
 *   Free      |   1   |     5     |       0     |  ~11,400    | (loss-leader)
 *   Starter   |   2   |    30     |  15,000     |  ~22,800    | (light loss-leader)
 *   Business  |   3   |   100     |  70,000     |  ~34,200    |  ~51%
 *   Agency    |   8   | unlimited | 200,000     |  ~91,200    |  ~54%
 *   Org/seat  |   2   |    50     |  15,000     |  ~22,800    | (subsidised)
 *
 * Account top-ups (any paid tier):
 *   +1 account: UGX 25,000 / mo
 *   +5 accounts: UGX 110,000 / mo
 */

export type PlanId = "free" | "starter" | "business" | "agency" | "org";

/** Add-on pack kinds. Each pack is one of:
 *  - "posts": one-off bundle that bumps the user's monthly post quota.
 *  - "accounts": ongoing add-on that raises the user's connected-account cap.
 *  - "report": one-off report download.
 */
export type AddonKind = "posts" | "accounts" | "report";

export interface AddonPack {
  kind: AddonKind;
  label: string;
  /** For kind="posts": how many posts the pack adds. */
  posts?: number;
  /** For kind="accounts": how many connected-account slots the pack adds. */
  accounts?: number;
  priceUgx: number;
  extra?: string;
}

/** Backwards-compat alias for any old call sites still importing `PostPack`. */
export type PostPack = AddonPack;

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
  packs: AddonPack[];
  hidden?: boolean;
  recommended?: boolean;
}

export const UGX = (n: number) => "UGX " + n.toLocaleString("en-UG");

/** Account top-up packs shared across paid tiers. */
const ACCOUNT_TOPUPS: AddonPack[] = [
  {
    kind: "accounts",
    label: "+1 connected account",
    accounts: 1,
    priceUgx: 25_000,
    extra: "per month",
  },
  {
    kind: "accounts",
    label: "+5 connected accounts",
    accounts: 5,
    priceUgx: 110_000,
    extra: "per month",
  },
];

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
      "1 connected account",
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
    monthlyUgx: 15_000,
    socialAccounts: 2,
    monthlyPosts: 30,
    teamSeats: 1,
    features: [
      "2 connected accounts (top up for more)",
      "30 scheduled posts / month",
      "Photo, carousel, short video",
      "MoMo / Airtel Money billing",
    ],
    packs: [
      { kind: "posts", label: "10-post pack", posts: 10, priceUgx: 5_000 },
      ...ACCOUNT_TOPUPS,
    ],
  },
  {
    id: "business",
    name: "Business",
    tagline: "For small business owners (the core)",
    monthlyUgx: 70_000,
    socialAccounts: 3,
    monthlyPosts: 100,
    teamSeats: 2,
    recommended: true,
    features: [
      "3 connected accounts (top up for more)",
      "100 scheduled posts / month",
      "All content types incl. Reels / Shorts",
      "AI caption suggestions",
      "Clicks-to-number tracking",
    ],
    packs: [
      { kind: "posts", label: "10-post pack", posts: 10, priceUgx: 4_000 },
      { kind: "report", label: "Report download", priceUgx: 3_000, extra: "per report" },
      ...ACCOUNT_TOPUPS,
    ],
  },
  {
    id: "agency",
    name: "Agency",
    tagline: "For agencies & multi-location brands",
    monthlyUgx: 200_000,
    socialAccounts: 8,
    monthlyPosts: "unlimited",
    teamSeats: 3,
    features: [
      "8 connected accounts (top up for more)",
      "Unlimited scheduled posts",
      "3 team seats",
      "Client approval workflows",
      "White-label report packs",
    ],
    packs: [
      { kind: "report", label: "5-report pack", priceUgx: 25_000 },
      ...ACCOUNT_TOPUPS,
    ],
  },
  {
    id: "org",
    name: "Org (by invite)",
    tagline: "Subsidised seat for partner-org members",
    monthlyUgx: 15_000,
    annualUgx: 144_000,
    socialAccounts: 2,
    monthlyPosts: 50,
    teamSeats: 1,
    hidden: true,
    features: [
      "UGX 15,000 / member / month (or 144,000 / year — 2 months free)",
      "2 connected accounts · 50 posts / month",
      "All content types incl. Reels / Shorts · AI caption suggestions",
      "Clicks-to-number tracking · Report downloads",
      "Individual MoMo billing per member · up to 1,000 members",
      "Org admin console & seat usage dashboard",
    ],
    packs: [
      { kind: "posts", label: "10-post pack", posts: 10, priceUgx: 4_000 },
      { kind: "report", label: "Report download", priceUgx: 3_000, extra: "per report" },
      ...ACCOUNT_TOPUPS,
    ],
  },
];

export const getPlan = (id: PlanId) => PLANS.find((p) => p.id === id)!;

export const PUBLIC_PLANS = PLANS.filter((p) => !p.hidden);
