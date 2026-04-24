import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="page">
      <section className="hero">
        <span className="pill">Built for Uganda · Pay with MoMo</span>
        <h1 style={{ marginTop: 10 }}>
          Post to all your pages from <span className="accent">one phone</span>.
        </h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Simple scheduling for Facebook, Instagram, TikTok, YouTube, WhatsApp
          and more. Designed for budget Android phones and patchy networks. In
          Ugandan Shillings.
        </p>
        <div className="stack" style={{ marginTop: 16 }}>
          <Link to="/signup" className="btn primary">
            Start free — 5 posts / month
          </Link>
          <Link to="/pricing" className="btn ghost">
            See paid plans
          </Link>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Why Posta</h2>
        <div className="card">
          <h3>Mobile Money first</h3>
          <p className="muted small">
            MTN MoMo and Airtel Money. No dollar cards. No rejected
            transactions.
          </p>
        </div>
        <div className="card">
          <h3>Data-light</h3>
          <p className="muted small">
            Under 120KB on first load. Images are compressed before upload so
            you don't burn bundles.
          </p>
        </div>
        <div className="card">
          <h3>One-tap connect</h3>
          <p className="muted small">
            Connect Facebook Pages and Instagram Business in under a minute.
            Then post everywhere at once.
          </p>
        </div>
        <div className="card">
          <h3>Top-up when you grow</h3>
          <p className="muted small">
            Low monthly base, add 10-post packs only when you need them. Your
            bill matches your business.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Who it's for</h2>
        <div className="card">
          <strong>Kick-Starter</strong>
          <p className="small muted">
            Salon owners, freelance photographers, young creators — look
            professional without the overhead.
          </p>
        </div>
        <div className="card">
          <strong>Grow</strong>
          <p className="small muted">
            Boutiques, e-commerce shops, restaurants running multiple pages —
            drive sales systematically.
          </p>
        </div>
        <div className="card">
          <strong>Scale</strong>
          <p className="small muted">
            Agencies managing many client pages — seats, reports, and client
            approval workflows.
          </p>
        </div>
      </section>

      <div className="footer">
        <p>Posta · Kampala · Pay in UGX · MoMo & Airtel Money</p>
        <p>
          <Link to="/join" className="link">
            Have an invite code?
          </Link>
        </p>
      </div>
    </main>
  );
}
