export default function Login() {
  return (
    <div className="login-simple">
      <header className="login-simple-header">
        <a href="/" aria-label="Honoré Tax & Wealth home">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </a>
        <a className="login-home" href="/">Back to website</a>
      </header>

      <main className="login-simple-main">
        <section className="login-simple-panel" aria-labelledby="login-title">
          <span className="login-eyebrow">HONORÉ TAX & WEALTH</span>
          <h1 id="login-title">Welcome back.</h1>
          <p className="login-intro">Access your account.</p>

          <form className="login-simple-form">
            <label htmlFor="access-type">Sign in as</label>
            <select id="access-type" name="access-type" defaultValue="client">
              <option value="client">Client</option>
              <option value="team">Team / Admin</option>
            </select>

            <label htmlFor="login-email">Email address</label>
            <input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />

            <label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" />

            <button type="button" disabled aria-describedby="login-preview-note">Sign in</button>
          </form>

          <p className="login-preview-note" id="login-preview-note">The secure portal is coming soon. Sign-in is currently unavailable; please do not enter personal or tax information here.</p>
          <div className="login-preview-links" aria-label="Explore dashboard previews">
            <a href="/dashboard/client">View client dashboard</a>
            <a href="/dashboard/admin?preview=1">View admin dashboard</a>
          </div>
          <a className="login-help" href="/#contact">Need help? Contact our team</a>
        </section>
      </main>
    </div>
  );
}
