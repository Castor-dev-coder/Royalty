import { useState } from 'react';
import { apiFetch, mockApiEnabled, storeAccessTokens } from '../api';
import { BrandShowcase } from '../components/BrandShowcase';
import { DemoCredentials } from '../components/DemoCredentials';
import { readLoginSession, storeAccountSession } from '../session';

/**
 * The staff member's sign-in.
 *
 * It uses the same sign-in endpoint as the administrator area, so the
 * credentials and the session handling are identical. What differs is the
 * framing: this page is for a staff member and does not mention the
 * administrator areas.
 */
export function StaffSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to sign in. Check your credentials and API connection.');
      storeAccessTokens(payload.data.accessToken, payload.data.refreshToken);
      const session = readLoginSession(payload);
      if (session) storeAccountSession(session);
      onSignedIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-form-panel">
        <div className="login-pane">
          <div className="login-brand-head">
            <span className="login-monogram" aria-hidden="true"><img src="/images/Logo.jpg" alt="" /></span>
            <div className="login-wordmark-block">
              <p className="login-wordmark">ROYALTY</p>
              <p className="login-brand-studio">Hair &amp; Nails Studio</p>
            </div>
          </div>

          <header className="login-pane-header">
            <p className="login-overline">Staff Access</p>
            <h1 className="login-title">Welcome back.</h1>
            <p className="login-lede">Sign in to see your bookings, your schedule and the services you can perform.</p>
          </header>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-field-label" htmlFor="staff-login-email">Email Address</label>
              <input
                id="staff-login-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
                autoComplete="username"
                placeholder="you@royalty.studio"
                required
              />
            </div>
            <div className="login-field">
              <label className="login-field-label" htmlFor="staff-login-password">Password</label>
              <div className="login-password-group">
                <input
                  id="staff-login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(''); }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="login-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                {error}
                <span className="sr-only">Sign-in error.</span>
              </p>
            )}
            <button type="submit" className="login-submit" disabled={submitting} aria-busy={submitting}>
              <span className="submit-text">{submitting ? 'Signing in…' : 'Sign In'}</span>
              <span className="submit-spinner" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4 31.4"/></svg>
              </span>
            </button>
            {mockApiEnabled && <DemoCredentials variant="staff" />}
          </form>
          <footer className="login-footer">
            <p>Royalty Hair &amp; Nails Studio</p>
          </footer>
        </div>
      </main>

      <BrandShowcase />
    </div>
  );
}
