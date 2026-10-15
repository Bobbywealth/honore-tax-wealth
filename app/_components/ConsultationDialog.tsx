/**
 * Globally available consultation-request dialog.
 *
 * Mounted in app/layout.tsx so every page (marketing, login, both portals)
 * can open it via the `data-open-consultation` attribute. Before, the dialog
 * only existed on the marketing homepage, so dashboard floating pills and
 * "Request a consultation" buttons inside the portals were dead ends.
 *
 * Server component — the open/close/submit logic lives in
 * public/consultation.js so the markup remains a plain <dialog> that any
 * page can target.
 *
 * The five-step form posts to /api/consultations via fetch from
 * consultation.js; the API returns 503 if downstream persistence isn't yet
 * wired, which the script surfaces as "We're having trouble…" inline.
 */
export default function ConsultationDialog() {
  return (
    <dialog id="consultation-dialog" className="consultation-dialog" aria-labelledby="consultation-title">
      <button type="button" className="dialog-close" data-close-consultation aria-label="Close form">
        ×
      </button>
      <div className="form-head">
        <span className="label">IHONORE / CONSULTATION REQUEST</span>
        <h2 id="consultation-title">
          Your next step, <br />
          <i>made simple.</i>
        </h2>
        <p>Send a request, not a confirmed booking. We'll discuss scope, fees, and appointment details before work begins.</p>
        <div className="form-stepper" role="tablist" aria-label="Form progress">
          <button type="button" className="form-step active" data-step="1" role="tab" aria-selected="true">
            <span className="step-num">1</span>
            <span className="step-label">Name</span>
          </button>
          <button type="button" className="form-step" data-step="2" role="tab" aria-selected="false">
            <span className="step-num">2</span>
            <span className="step-label">Email</span>
          </button>
          <button type="button" className="form-step" data-step="3" role="tab" aria-selected="false">
            <span className="step-num">3</span>
            <span className="step-label">Phone</span>
          </button>
          <button type="button" className="form-step" data-step="4" role="tab" aria-selected="false">
            <span className="step-num">4</span>
            <span className="step-label">Service</span>
          </button>
          <button type="button" className="form-step" data-step="5" role="tab" aria-selected="false">
            <span className="step-num">5</span>
            <span className="step-label">Notes</span>
          </button>
        </div>
      </div>
      <form id="consultation-form" noValidate>
        <div className="form-panel" data-panel="1">
          <p className="form-prompt">Let's start with your name.</p>
          <label className="float-field has-value">
            <span>Full name</span>
            <input name="name" autoComplete="name" maxLength={100} required />
          </label>
          <div className="form-actions">
            <button type="button" className="form-next" data-next="2">
              CONTINUE →
            </button>
          </div>
        </div>
        <div className="form-panel hidden" data-panel="2">
          <p className="form-prompt">What's a good email for the reply?</p>
          <label className="float-field has-value">
            <span>Email address</span>
            <input type="email" name="email" autoComplete="email" maxLength={180} required />
          </label>
          <div className="form-actions">
            <button type="button" className="form-back" data-prev="1">
              ← BACK
            </button>
            <button type="button" className="form-next" data-next="3">
              CONTINUE →
            </button>
          </div>
        </div>
        <div className="form-panel hidden" data-panel="3">
          <p className="form-prompt">And a phone number we can reach you on.</p>
          <label className="float-field has-value">
            <span>Phone number</span>
            <input type="tel" name="phone" autoComplete="tel" maxLength={30} required />
          </label>
          <div className="form-actions">
            <button type="button" className="form-back" data-prev="2">
              ← BACK
            </button>
            <button type="button" className="form-next" data-next="4">
              CONTINUE →
            </button>
          </div>
        </div>
        <div className="form-panel hidden" data-panel="4">
          <p className="form-prompt">What can we help you with?</p>
          <label className="float-field">
            <span>Choose a service</span>
            <select name="service" required defaultValue="">
              <option value="" disabled>
                Choose a service…
              </option>
              <option>Individual tax preparation</option>
              <option>Business tax filing</option>
              <option>Tax planning</option>
              <option>IRS notice help</option>
              <option>Not sure yet</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="form-back" data-prev="3">
              ← BACK
            </button>
            <button type="button" className="form-next" data-next="5">
              CONTINUE →
            </button>
          </div>
        </div>
        <div className="form-panel hidden" data-panel="5">
          <p className="form-panel-intro">Tell us a little more so the right person can help.</p>
          <p className="form-selected-service" id="selected-service-summary" />
          <label className="float-field full">
            <span>
              Anything else? <em>optional</em>
            </span>
            <textarea name="message" maxLength={500} rows={3} placeholder="A short description of what you need" />
          </label>
          <div className="form-trust">
            <span className="trust-item">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M12 1l9 4v6c0 5.5-3.8 10.7-9 12-5.2-1.3-9-6.5-9-12V5l9-4z" />
              </svg>
              Personal follow-up
            </span>
            <span className="trust-item">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M12 1l3 6 6 .9-4.5 4.4 1 6.3L12 15.8 6.5 18.6l1-6.3L3 7.9 9 7z" />
              </svg>
              Consultation request only
            </span>
            <span className="trust-item">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M18 8h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6z" />
              </svg>
              No tax documents needed
            </span>
          </div>
          <div className="form-actions between">
            <button type="button" className="form-back" data-prev="4">
              ← BACK
            </button>
            <button type="submit" className="form-submit">
              REQUEST MY CONSULTATION <span>↗</span>
            </button>
          </div>
        </div>
        <div className="trap" aria-hidden="true">
          <label>
            <span>Leave this empty</span>
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p className="form-privacy-note">
          Please leave out tax forms and identification numbers. View our <a href="/privacy">privacy policy</a>.
        </p>
        <p id="form-feedback" role="status" aria-live="polite" />
      </form>
    </dialog>
  );
}
