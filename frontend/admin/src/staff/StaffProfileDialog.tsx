import { useState } from 'react';
import { apiFetch, getAccessToken } from '../api';
import { useDialogBehavior } from '../components/useDialogBehavior';

/**
 * Create a staff profile for an existing staff account.
 *
 * The account and the staff profile are separate things: the account holds
 * the credentials and decides whether the person can sign in, and the staff
 * profile holds the working details. This dialog attaches a profile to an
 * account that already has the staff role and no profile yet, which is the
 * operation the API supports.
 */

export interface StaffProfileCandidate {
  accountId: string;
  email: string;
  name: string;
}

export function StaffProfileDialog({
  candidates,
  onClose,
  onCreated,
}: {
  candidates: StaffProfileCandidate[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(candidates[0]?.accountId ?? '');
  const [firstName, setFirstName] = useState(candidates[0]?.name.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(candidates[0]?.name.split(' ').slice(1).join(' ') ?? '');
  const [phone, setPhone] = useState('');
  const [primaryRole, setPrimaryRole] = useState('Stylist');
  const [employmentType, setEmploymentType] = useState<'FULL_TIME' | 'PART_TIME'>('FULL_TIME');
  const [workStatus, setWorkStatus] = useState<'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE'>('DAY_OFF');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dialogRef = useDialogBehavior<HTMLFormElement>(onClose);

  function chooseAccount(accountId: string) {
    setSelectedAccountId(accountId);
    const candidate = candidates.find((item) => item.accountId === accountId);
    if (!candidate) return;
    const parts = candidate.name.trim().split(/\s+/);
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' '));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccountId) {
      setError('Choose the account this staff profile belongs to.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter a first name and a last name.');
      return;
    }
    if (!primaryRole.trim()) {
      setError('Enter a primary role.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const token = getAccessToken();
      const response = await apiFetch(`${baseUrl}/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          primaryRole: primaryRole.trim(),
          employmentType,
          workStatus,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? payload.message ?? 'The staff profile could not be created.');
      }
      const candidate = candidates.find((item) => item.accountId === selectedAccountId);
      onCreated(`A staff profile was created for ${candidate?.email ?? 'the account'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The staff profile could not be created.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-profile-create-title" onClick={onClose}>
      <form ref={dialogRef} className="modal-card" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="staff-profile-create-title">Create Staff Profile</h3>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-subtitle">Attach a staff profile to an account that has the staff role.</div>

        <label className="field-label" htmlFor="staff-profile-account">ACCOUNT</label>
        <select id="staff-profile-account" className="modal-input" value={selectedAccountId} onChange={(event) => chooseAccount(event.target.value)} required>
          {candidates.map((candidate) => (
            <option key={candidate.accountId} value={candidate.accountId}>{candidate.email} — {candidate.name}</option>
          ))}
        </select>

        <div className="form-grid">
          <label className="field-label" htmlFor="staff-profile-first">FIRST NAME<input id="staff-profile-first" className="modal-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} required /></label>
          <label className="field-label" htmlFor="staff-profile-last">LAST NAME<input id="staff-profile-last" className="modal-input" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} required /></label>
        </div>

        <label className="field-label" htmlFor="staff-profile-phone">PHONE<input id="staff-profile-phone" className="modal-input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} /></label>
        <label className="field-label" htmlFor="staff-profile-role">PRIMARY ROLE<input id="staff-profile-role" className="modal-input" value={primaryRole} onChange={(event) => setPrimaryRole(event.target.value)} maxLength={100} required /></label>

        <div className="form-grid">
          <label className="field-label" htmlFor="staff-profile-employment">EMPLOYMENT TYPE
            <select id="staff-profile-employment" className="modal-input" value={employmentType} onChange={(event) => setEmploymentType(event.target.value as 'FULL_TIME' | 'PART_TIME')}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
            </select>
          </label>
          <label className="field-label" htmlFor="staff-profile-status">AVAILABILITY
            <select id="staff-profile-status" className="modal-input" value={workStatus} onChange={(event) => setWorkStatus(event.target.value as 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE')}>
              <option value="ON_DUTY">On duty</option>
              <option value="DAY_OFF">Day off</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={submitting}>{submitting ? 'Creating…' : 'Create profile'}</button>
        </div>
      </form>
    </div>
  );
}
