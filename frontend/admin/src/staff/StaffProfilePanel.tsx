import { useEffect, useState } from 'react';
import { useDialogBehavior } from '../components/useDialogBehavior';
import {
  EmptyState,
  ErrorState,
  SkeletonRegion,
  ListSkeleton,
  Panel,
  formatDate,
} from '../shared/ui';
import { staffApi, type StaffAccount, type StaffProfile } from './staffApi';

/**
 * The staff member's own profile and account.
 *
 * Two different states appear here and they are never conflated:
 *
 * - Account access is the account's own status. A deactivated account cannot
 *   sign in even though the staff profile and its schedule still exist.
 * - Availability is the staff work status. It decides whether the member is
 *   on duty, off for the day, or unavailable, and it does not affect sign-in.
 *
 * A staff member may edit their own phone and their own sign-in email, and
 * change their own password. Availability is set by a manager, so it is
 * shown for reference only.
 */

const WORK_STATUS_TEXT: Record<string, string> = {
  ON_DUTY: 'On duty',
  DAY_OFF: 'Day off',
  UNAVAILABLE: 'Unavailable',
};

const WORK_STATUS_BADGE: Record<string, string> = {
  ON_DUTY: 'status-completed',
  DAY_OFF: 'status-reserved',
  UNAVAILABLE: 'status-noshow',
};

const EMPLOYMENT_TEXT: Record<string, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
};

export function StaffProfilePanel() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [account, setAccount] = useState<StaffAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const closePasswordForm = () => setShowPasswordForm(false);
  const passwordRef = useDialogBehavior<HTMLFormElement>(closePasswordForm, showPasswordForm);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const loadedProfile = await staffApi.getProfile();
      setProfile(loadedProfile);
      // The account row is read through the account link on the staff profile.
      setAccount(loadedProfile.accountId ? await staffApi.getAccount(loadedProfile.accountId) : null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function savePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    try {
      const updated = await staffApi.updateOwnPhone(phone);
      setProfile(updated);
      setNotice('Your contact number was updated.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Your contact number could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    try {
      const updated = await staffApi.updateOwnEmail(email);
      setAccount(updated);
      setNotice('Your sign-in email was updated.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Your email could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) {
      setFormError('The new password and its confirmation do not match.');
      setSaving(false);
      return;
    }
    try {
      await staffApi.changeOwnPassword(currentPassword, newPassword);
      setShowPasswordForm(false);
      setNotice('Your password was changed.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Your password could not be changed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SkeletonRegion label="Loading your profile">
        <ListSkeleton rows={5} />
      </SkeletonRegion>
    );
  }
  if (loadError) return <ErrorState>{loadError}</ErrorState>;
  if (!profile) return <ErrorState>No staff profile is linked to this account.</ErrorState>;

  return (
    <>
      {notice && <p className="form-hint" role="status">{notice}</p>}

      <div className="two-col-panel">
        <Panel title="My Profile" meta={profile.primaryRole} className="side-panel">
          <ul className="summary-list">
            <li><span>Name</span><strong>{profile.firstName} {profile.lastName}</strong></li>
            <li><span>Primary role</span><strong>{profile.primaryRole}</strong></li>
            <li><span>Employment</span><strong>{EMPLOYMENT_TEXT[profile.employmentType] ?? profile.employmentType}</strong></li>
            <li>
              <span>Availability</span>
              <span className={`status-badge ${WORK_STATUS_BADGE[profile.workStatus] ?? 'status-noshow'}`}>
                {WORK_STATUS_TEXT[profile.workStatus] ?? profile.workStatus}
              </span>
            </li>
            <li><span>Member since</span><strong>{formatDate(profile.createdAt)}</strong></li>
          </ul>
          <p className="form-hint">Availability is set by a manager and decides when you are working, not whether you can sign in.</p>
        </Panel>

        <Panel title="My Account" meta={account?.status === 'DEACTIVATED' ? 'Access disabled' : 'Access enabled'} className="side-panel">
          <ul className="summary-list">
            <li><span>Sign-in email</span><strong>{account?.email ?? 'Not available'}</strong></li>
            <li>
              <span>Account access</span>
              <span className={`status-badge ${account?.status === 'ACTIVE' ? 'status-completed' : 'status-cancelled'}`}>
                {account?.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
              </span>
            </li>
            <li><span>Role</span><strong>{account?.role ?? 'STAFF'}</strong></li>
          </ul>
          {account?.status === 'DEACTIVATED' && (
            <p className="form-error" role="alert">
              This account is deactivated, so signing in is blocked. A manager can reactivate it.
            </p>
          )}
          <p className="form-hint">Account access is separate from your availability above.</p>
        </Panel>
      </div>

      <div className="two-col-panel">
        <Panel title="Contact Number" className="side-panel">
          <form onSubmit={savePhone}>
            <label className="field-label" htmlFor="staff-phone">PHONE NUMBER</label>
            <input id="staff-phone" name="phone" className="modal-input" defaultValue={profile.phone ?? ''} maxLength={30} />
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="modal-actions">
              <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save number'}</button>
            </div>
          </form>
        </Panel>

        <Panel title="Sign-In Email" className="side-panel">
          <form onSubmit={saveEmail}>
            <label className="field-label" htmlFor="staff-email">EMAIL ADDRESS</label>
            <input id="staff-email" name="email" type="email" className="modal-input" defaultValue={account?.email ?? ''} required />
            <div className="modal-actions">
              <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save email'}</button>
            </div>
          </form>
        </Panel>
      </div>

      <Panel title="Password" meta="Change your own password" className="side-panel">
        <p className="form-hint">Your current password is required to set a new one.</p>
        <button type="button" className="secondary-action" onClick={() => setShowPasswordForm(true)}>Change password</button>
      </Panel>

      {showPasswordForm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="password-change-title" onClick={closePasswordForm}>
          <form ref={passwordRef} className="modal-card" onSubmit={savePassword} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="password-change-title">Change your password</h3>
              <button type="button" className="close-button" aria-label="Close password form" onClick={closePasswordForm}>×</button>
            </div>

            <label className="field-label" htmlFor="current-password">CURRENT PASSWORD</label>
            <input id="current-password" name="currentPassword" type="password" className="modal-input" autoComplete="current-password" required />

            <label className="field-label" htmlFor="new-password">NEW PASSWORD</label>
            <input id="new-password" name="newPassword" type="password" className="modal-input" autoComplete="new-password" minLength={8} required />

            <label className="field-label" htmlFor="confirm-password">CONFIRM NEW PASSWORD</label>
            <input id="confirm-password" name="confirmPassword" type="password" className="modal-input" autoComplete="new-password" minLength={8} required />

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={closePasswordForm}>Cancel</button>
              <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
            </div>
          </form>
        </div>
      )}

      {!profile.phone && <EmptyState>No contact number is recorded yet.</EmptyState>}
    </>
  );
}
