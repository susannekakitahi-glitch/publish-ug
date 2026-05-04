import { Link } from "react-router-dom";

/** Landing page.
 *
 *  Rewritten in a SaaS-style pitch layout inspired by Buffer / Later /
 *  Hootsuite / Postiz: a strong hero that names the real pain
 *  (content-calendar overwhelm, platform hopping, consistency, approval
 *  chaos) rather than leaning on Mobile Money — MoMo is still the
 *  checkout rail but it isn't a reason to buy. The rest of the app
 *  (mobile-first 480px column) stays unchanged; the `.landing` class
 *  opts into a wider, fully-responsive layout scoped to this page.
 */
export default function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero-bg" aria-hidden />
        <div className="landing-hero-inner">
          <span className="landing-badge">Built for modern creators, SMBs & agencies</span>
          <h1 className="landing-h1">
            One calm workspace for every
            {" "}
            <span className="landing-gradient-word">social channel</span>
            {" "}
            your business runs.
          </h1>
          <p className="landing-sub">
            Plan a month of content in one sitting. Schedule Facebook, Instagram,
            TikTok, LinkedIn, YouTube, X, WhatsApp and Telegram from one
            dashboard — not seven browser tabs at 11pm. No context switching.
            No missed days. No "wait, did that post go out?"
          </p>
          <div className="landing-cta-row">
            <Link to="/signup" className="btn primary landing-cta-primary">
              Start free — no card needed
            </Link>
            <Link to="/pricing" className="btn ghost landing-cta-ghost">
              See plans
            </Link>
          </div>
          <div className="landing-proof">
            <span className="landing-proof-dot" />
            Publishes to 8 networks · Multi-account · Agency-ready
          </div>
        </div>

        <div className="landing-platform-cloud" aria-hidden>
          {[
            { k: "FB", name: "Facebook" },
            { k: "IG", name: "Instagram" },
            { k: "X", name: "X" },
            { k: "IN", name: "LinkedIn" },
            { k: "TT", name: "TikTok" },
            { k: "YT", name: "YouTube" },
            { k: "WA", name: "WhatsApp" },
            { k: "TG", name: "Telegram" },
          ].map((p) => (
            <div key={p.k} className="landing-plat-chip" title={p.name}>
              {p.k}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">The problem isn't posting. It's keeping up.</h2>
        <p className="landing-lead">
          Creators and business owners don't stop because they don't have ideas —
          they stop because social media asks for consistency every single day
          and no one built you a single place to deliver it. Posta is that place.
        </p>

        <div className="landing-compare">
          <div className="landing-compare-col landing-compare-bad">
            <div className="landing-compare-title">Without Posta</div>
            <ul>
              <li>You post for two weeks, disappear for three.</li>
              <li>You open Facebook, Instagram, TikTok, LinkedIn one by one.</li>
              <li>You forget which page the caption was meant for.</li>
              <li>You miss peak hours because you're in a meeting.</li>
              <li>Clients WhatsApp you at midnight to approve a post.</li>
              <li>You have no idea which posts actually worked.</li>
            </ul>
          </div>
          <div className="landing-compare-col landing-compare-good">
            <div className="landing-compare-title">With Posta</div>
            <ul>
              <li>Plan a whole month in one visual calendar.</li>
              <li>Write once, tailor per platform, schedule everywhere.</li>
              <li>Drag a post between days to reschedule instantly.</li>
              <li>Best-time hints surface your own historical peak slots.</li>
              <li>Agency clients approve in the app, with a clean log.</li>
              <li>See what's working — reach, clicks, engagement — in one view.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">Everything a modern social workflow needs</h2>
        <div className="landing-pillars">
          <article className="landing-pillar">
            <div className="landing-pillar-ico">📅</div>
            <h3>Plan</h3>
            <p>
              A visual calendar you can actually drag. Bulk-add a month of posts
              from a paste of captions. Recurring posts for your "Happy Friday"
              routine. Templates for the lines you reuse.
            </p>
          </article>
          <article className="landing-pillar">
            <div className="landing-pillar-ico">✍️</div>
            <h3>Create</h3>
            <p>
              One composer for every platform. Multi-platform preview side by
              side so you see exactly how a caption lands on LinkedIn vs
              Instagram vs X — before you hit schedule.
            </p>
          </article>
          <article className="landing-pillar">
            <div className="landing-pillar-ico">🚀</div>
            <h3>Publish</h3>
            <p>
              Facebook, Instagram, TikTok, LinkedIn, YouTube, X, WhatsApp and
              Telegram from one tap. Auto-retries when a platform hiccups. You
              never lose a scheduled post to a flaky network.
            </p>
          </article>
          <article className="landing-pillar">
            <div className="landing-pillar-ico">📈</div>
            <h3>Measure</h3>
            <p>
              Real reach, clicks and engagement pulled from each platform —
              bucketed by day and hour so you know your real peak times, not a
              generic "post at 9am" cliché.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">Built for three kinds of people</h2>
        <div className="landing-personas">
          <div className="landing-persona">
            <div className="landing-persona-tag">Creators</div>
            <h3>Post without burning out.</h3>
            <p>
              Stop platform-hopping every time you want to share a thought.
              Record once, schedule to every channel, go back to making the
              actual content.
            </p>
            <ul>
              <li>Visual calendar with drag-to-reschedule</li>
              <li>Per-platform preview so captions don't break on LinkedIn</li>
              <li>Best-time hints based on your own post history</li>
            </ul>
          </div>
          <div className="landing-persona">
            <div className="landing-persona-tag">Small businesses</div>
            <h3>Show up consistently — even when you're busy.</h3>
            <p>
              Set an entire week in 20 minutes. Recurring posts cover the daily
              ones. Templates cover the repeat promos. Your feed stops looking
              abandoned.
            </p>
            <ul>
              <li>Bulk-add captions, auto-distributed across days</li>
              <li>Recurring posts for your daily / weekly rituals</li>
              <li>Pay in local currency when you're ready to scale</li>
            </ul>
          </div>
          <div className="landing-persona">
            <div className="landing-persona-tag">Agencies</div>
            <h3>Stop chasing approvals in WhatsApp.</h3>
            <p>
              Every client is a separate brand space. Draft, send for
              approval, track what's gone out — clean per-client analytics and
              audit trail included.
            </p>
            <ul>
              <li>Multi-client workspaces with seat-based pricing</li>
              <li>Client approval workflow with clear status per post</li>
              <li>Per-client analytics so every monthly report writes itself</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">Features that actually move the needle</h2>
        <div className="landing-features">
          {[
            ["Visual calendar", "Drag posts between days, preview at a glance, click any day to edit that day's plan."],
            ["Bulk add", "Paste a list of captions, pick your slots, auto-distribute across days."],
            ["Recurring posts", "Daily, weekly or monthly — with pause/resume without losing the series."],
            ["Multi-platform preview", "Live side-by-side of how a post will look on every channel you selected."],
            ["Caption templates", "Save your best-performing captions, reuse with one tap."],
            ["Best-time hints", "From your own sent-post history — not a generic guess."],
            ["Drag-and-drop media", "Drop images into the composer, drag to reorder, cover auto-marked."],
            ["Image compression", "Posta downscales before upload so you don't burn data bundles."],
            ["Client approvals", "Share a preview link with clients, track approvals cleanly."],
            ["Multi-account", "Connect multiple pages per platform, pick the right one per post."],
          ].map(([title, body]) => (
            <div className="landing-feature" key={title}>
              <div className="landing-feature-dot" />
              <div>
                <strong>{title}</strong>
                <p className="small muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta-section">
        <h2 className="landing-h2">Your social, on the rails.</h2>
        <p className="landing-lead">
          Stop writing the same caption five times. Stop posting into the void
          at the wrong hour. Plan once, schedule everywhere, and get back to
          the work only you can do.
        </p>
        <div className="landing-cta-row">
          <Link to="/signup" className="btn primary landing-cta-primary">
            Start free — 5 posts / month
          </Link>
          <Link to="/pricing" className="btn ghost landing-cta-ghost">
            Compare plans
          </Link>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Works on any phone or laptop. No app install. 8 social networks
          supported today — more rolling in.
        </p>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>Posta</strong>
          <span className="small muted"> · plan, schedule, grow.</span>
        </div>
        <div className="landing-footer-links small muted">
          <Link to="/pricing" className="link">Pricing</Link>
          <span> · </span>
          <Link to="/join" className="link">Have an invite code?</Link>
          <span> · </span>
          <Link to="/login" className="link">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
