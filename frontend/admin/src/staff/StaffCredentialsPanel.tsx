import { useState } from 'react';
import { apiFetch, getAccessToken } from '../api';
import { useDialogBehavior } from '../components/useDialogBehavior';

/**
 * Present the credentials of a staff account to an administrator.
 *
 * The API stores a bcrypt hash and never returns the original password, so
 * this panel is shown once, immediately after the password is set, and the
 * password is not kept in storage of any kind. The administrator hands it to
 * the staff member directly.
 *
 * The endpoint used is `POST /accounts/:id/password`, which the backend
 * restricts to administrators and managers and which does not require the
 * account's current password.
 */

export interface StaffCredentials {
  accountId: string;
  email: string;
  name: string;
  password: string;
}

export function StaffCredentialsPanel({
  credentials,
  onClose,
}: {
  credentials: StaffCredentials;
  onClose: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const dialogRef = useDialogBehavior<HTMLDivElement>(onClose);

  async function copy(what: 'email' | 'password' | 'both') {
    const text = what === 'email'
      ? credentials.email
      : what === 'password'
        ? credentials.password
        : `Email: ${credentials.email}\nTemporary password: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // The browser refused clipboard access. The values stay selectable, so
      // the administrator can still copy them by hand.
      setCopyFailed(true);
      setCopied(null);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-credentials-title" onClick={onClose}>
      <div ref={dialogRef} className="modal-card credentials-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="staff-credentials-title">Staff sign-in details</h3>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <p className="credentials-intro">
          Give these details to <strong>{credentials.name}</strong> so they can sign in. The password is shown
          only here and is never stored in the browser, so copy it now.
        </p>

        <div className="credentials-row">
          <div className="credentials-label">
            <span>Sign-in email</span>
            <button
              type="button"
              className="credentials-copy"
              onClick={() => void copy('email')}
              aria-label="Copy sign-in email"
            >
              {copied === 'email' ? 'Copied' : 'Copy email'}
            </button>
          </div>
          <p className="credentials-value credentials-email">{credentials.email}</p>
        </div>

        <div className="credentials-row">
          <div className="credentials-label">
            <span>Temporary password</span>
            <div className="credentials-actions">
              <button
                type="button"
                className="credentials-copy"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide temporary password' : 'Show temporary password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="credentials-copy"
                onClick={() => void copy('password')}
                aria-label="Copy temporary password"
              >
                {copied === 'password' ? 'Copied' : 'Copy password'}
              </button>
            </div>
          </div>
          <p
            className="credentials-value credentials-password"
            aria-label={showPassword ? 'Temporary password' : 'Temporary password, hidden'}
          >
            {showPassword ? credentials.password : '•'.repeat(Math.min(credentials.password.length, 16))}
          </p>
        </div>

        <button type="button" className="secondary-action credentials-copy-all" onClick={() => void copy('both')}>
          {copied === 'both' ? 'Credentials copied' : 'Copy email and password'}
        </button>

        {copyFailed && (
          <p className="form-error" role="alert">
            This browser blocked clipboard access. Select the email and password above and copy them directly.
          </p>
        )}

        <p className="credentials-note">
          Pass the password to the staff member over a channel you trust, and ask them to change it
          after their first sign-in. The account page can issue a new temporary password at any time.
        </p>

        <div className="modal-actions">
          <button type="button" className="primary-action" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Issue a temporary password for an existing staff account.
 *
 * The administrator never learns an existing password, so this sets a new
 * one. The endpoint is the one the backend exposes for administrators and
 * managers; it does not require the account's current password.
 */
export async function issueStaffPassword(accountId: string, newPassword: string): Promise<void> {
  const token = getAccessToken();
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  const response = await apiFetch(`${baseUrl}/accounts/${accountId}/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ currentPassword: '', newPassword }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? payload?.message ?? 'The temporary password could not be set.');
  }
}
