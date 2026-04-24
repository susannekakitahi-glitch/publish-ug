# Posta — Mobile-first, data-light social publishing for Uganda

A web app for small businesses, creators and agencies in Uganda (and the rest of the African market) to manage their social media pages from a single, data-light mobile interface. Payments are priced in Ugandan Shillings and flow through MTN MoMo and Airtel Money.

Built from two source documents provided by the product owner:

- Social Media Publishing Machine — Full Ecosystem Guide (product + architecture)
- Go-to-Market Plan: A Hybrid SaaS Solution for Uganda's SME Market (pricing + positioning)

## Why this app exists

- **Mobile-first**: budget Android phones, patchy 3G
- **Data-light**: ~85 KB gzipped JS on first load, compressed CSS, no heavy fonts or images
- **Pay in UGX via MoMo / Airtel Money** — no dollar cards, no rejected transactions
- **Top-up hybrid pricing** — low monthly base + post packs when you grow
- **Hidden Org plan** — partner-only discounted pricing surfaced only via invite code

## Feature set (merged from both docs)

- Multi-platform composer (status, photo, carousel, short video, YouTube share)
- Targeting across Facebook, Instagram, X, LinkedIn, TikTok, YouTube, WhatsApp Channels, Telegram
- Visual calendar + scheduling queue
- Single analytics view: **Posts Sent · People Reached · Clicks to Your Number**
- Onboarding to connect pages (mocked OAuth in this MVP)
- AI caption enhancement (gated to Business & Agency plans)
- Usage tracking + Post Packs
- Mobile Money checkout UI (mocked STK push for MoMo & Airtel)
- Agency features: team seats, multi-brand, report packs
- **Hidden Org plan** via `/join?code=...` with a per-org Admin console

## Pricing

Public tiers (shown on `/pricing`):

| Plan     | Base (UGX/mo) | Accounts | Posts     | Key add-ons                                    |
| -------- | ------------- | -------- | --------- | ---------------------------------------------- |
| Free     | 0             | 1        | 5         | —                                              |
| Starter  | 10,000        | 2        | 15        | 10-post pack UGX 5,000                         |
| Business | 50,000        | 5        | 50        | 10-post pack UGX 4,000 · Report UGX 3,000      |
| Agency   | 150,000       | 15       | unlimited | 5-seat pack UGX 50,000 · 5-report pack 25,000  |

Hidden Org plan (not on `/pricing`, invite-only via `/join?code=XXX`):

- UGX 5,000 / member / month
- UGX 48,000 / member / year (2 months free)
- Up to 1,000 members per org, individual MoMo billing per member
- Org admin console with seat usage, member activity, and copyable invite link

Try invite codes `ELYON2026` or `EQUITY-SME` on `/join` to see the flow.

## Tech

- Vite + React 19 + TypeScript
- React Router 7
- Plain mobile-first CSS (no UI framework — keeps bundle small)
- Mock in-memory / `localStorage` state (real Supabase / Pesapal wiring is Phase 2)

## Develop

```bash
npm install
npm run dev       # start dev server
npm run lint      # eslint
npm run build     # typecheck + production bundle
npm run preview   # preview built bundle
```

## Routes

- `/` — landing
- `/pricing` — public plans (Org plan hidden)
- `/signup?plan=<id>` — signup with MoMo checkout
- `/login`
- `/join?code=<code>` — hidden Org plan entry
- `/onboarding` — connect social pages
- `/dashboard` — analytics + upcoming posts
- `/compose` — multi-platform composer
- `/schedule` — queue + calendar + sent
- `/settings` — billing, post packs, upgrades
- `/org` — org admin console (only for org members)

## Status

This is a frontend MVP. Backend integrations (Meta Graph API, Ayrshare, Pesapal/DPO for MoMo, Supabase) are stubbed — payments and posts are mocked so the full flow can be demoed end-to-end on a phone.
