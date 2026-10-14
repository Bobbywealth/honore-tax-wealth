/**
 * Standard site footer for public pages with minimal layouts
 * (/about, /contact, /login). Mirrors the homepage footer with
 * absolute anchor URLs so in-page links work from any route.
 */
export default function SiteFooter() {
  return (
    <footer className="footer honore-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="brand" href="/" aria-label="Honore Tax & Wealth home">
              <picture>
                <source type="image/webp" srcSet="/assets/honore-logo-sm.webp 1x, /assets/honore-logo-sm@2x.webp 2x" />
                <img className="brand-logo" src="/assets/honore-logo-cropped-sm.png" alt="Honore Tax & Wealth" width="130" height="84" loading="lazy" decoding="async" />
              </picture>
            </a>
            <p>Personal attention.<br />A bigger picture in focus.</p>
            <span className="footer-brand-note">Tax preparation · Filing · Planning</span>
            <dl className="footer-contact" aria-label="Contact information">
              <div><dt>Phone</dt><dd><a href="tel:+14073407964" style={{ color: "inherit", textDecoration: "none" }}>407-340-7964</a></dd></div>
              <div><dt>Email</dt><dd><a href="mailto:ihonoretaxwealth@gmail.com" style={{ color: "inherit", textDecoration: "none" }}>ihonoretaxwealth@gmail.com</a></dd></div>
            </dl>
          </div>
          <nav className="footer-col" aria-label="Footer company navigation">
            <strong>COMPANY</strong>
            <a href="/about">About</a>
            <a href="/#agents">Our agents</a>
            <a href="/#founders">Meet the founders</a>
            <a href="/#experience">How it works</a>
            <a href="/#faq">Common questions</a>
          </nav>
          <nav className="footer-col" aria-label="Footer services">
            <strong>HOW WE HELP</strong>
            <a href="/services/personal-taxes">Personal taxes</a>
            <a href="/services/business-taxes">Business filing</a>
            <a href="/services/tax-planning">Tax planning</a>
            <a href="/services/irs-notices">IRS notice help</a>
          </nav>
          <nav className="footer-col" aria-label="Footer resources">
            <strong>GET STARTED</strong>
            <a href="/services/personal-taxes#prepare">Preparation guide</a>
            <a href="/contact">Contact</a>
            <a href="/login">Client portal</a>
            <a className="footer-top-link" href="#top">Back to top <span aria-hidden="true">↑</span></a>
          </nav>
        </div>
        <div className="footer-security">
          <span aria-hidden="true">◇</span>
          <p>Please don’t send tax forms, Social Security numbers, or other sensitive information through the consultation form.</p>
        </div>
        <div className="footer-bar">
          <span>© Honore Tax & Wealth</span>
          <nav aria-label="Legal information">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <span className="footer-signoff">PLAN. PREPARE. MOVE FORWARD.</span>
        </div>
      </div>
    </footer>
  );
}
