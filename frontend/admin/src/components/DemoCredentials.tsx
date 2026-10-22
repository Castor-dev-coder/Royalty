import { useState } from 'react';
import { DEMO_ADMIN_ACCOUNT, DEMO_STAFF_ACCOUNT } from '../api';

/**
 * The development demo credentials shown on the sign-in screens.
 *
 * The values come from the mock adapter's own constants, so what is shown is
 * exactly what the adapter accepts. These are fictional local-development
 * credentials for browser-only demo data; they are not real accounts.
 */

interface DemoAccount {
  label: string;
  email: string;
  password: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The browser refused clipboard access. The value stays selectable, so
      // it can still be copied by hand.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="login-demo-copy"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function AccountBlock({ account }: { account: DemoAccount }) {
  return (
    <div className="login-demo-account">
      <p className="login-demo-account-label">{account.label}</p>
      <dl className="login-demo-list">
        <div className="login-demo-row">
          <dt>Email</dt>
          <dd>{account.email}</dd>
          <CopyButton value={account.email} label={`${account.label} email`} />
        </div>
        <div className="login-demo-row">
          <dt>Password</dt>
          <dd>{account.password}</dd>
          <CopyButton value={account.password} label={`${account.label} password`} />
        </div>
      </dl>
    </div>
  );
}

export function DemoCredentials({ variant = 'both' }: { variant?: 'both' | 'staff' }) {
  const accounts: DemoAccount[] = variant === 'staff'
    ? [DEMO_STAFF_ACCOUNT]
    : [DEMO_ADMIN_ACCOUNT, DEMO_STAFF_ACCOUNT];

  return (
    <aside className="login-demo" aria-label="Development demo accounts">
      <p className="login-demo-title">Development demo accounts</p>
      {accounts.map((account) => (
        <AccountBlock key={account.email} account={account} />
      ))}
      <p className="login-demo-note">
        Fictional browser data for local Vite development only. Signing in as the staff
        member opens the staff dashboard.
      </p>
      {/* The other sign-in page, so neither screen hides the other's account. */}
      <a className="login-demo-switch" href={variant === 'staff' ? '/' : '/my'}>
        {variant === 'staff' ? 'Signing in as an administrator?' : 'Signing in as a staff member?'}
        <span>{variant === 'staff' ? 'Go to the administrator sign-in' : 'Go to the staff sign-in'}</span>
      </a>
    </aside>
  );
}
