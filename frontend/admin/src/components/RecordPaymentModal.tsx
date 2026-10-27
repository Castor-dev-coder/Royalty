import { useMemo, useState } from 'react';
import { apiFetch, authHeader, getAccessToken } from '../api';
import { AppointmentCodeInput } from './AppointmentCodeInput';
import { useDialogBehavior } from './useDialogBehavior';
import { FieldError, invalidField, formatMoney } from '../shared/ui';
import {
  recordAmountError,
  toPaymentRow,
  type PaymentMethod,
  type PaymentRow,
} from '../payments';

/**
 * One appointment the picker may record money against.
 *
 * `outstanding` is the server's figure and comes only from a payment record
 * the server produced. When it is unknown the form shows the appointment
 * total instead and applies no ceiling of its own: the API re-checks every
 * amount and answers 409 when it exceeds the outstanding balance.
 */
export type RecordPaymentOption = {
  appointmentId: string;
  appointmentCode: string;
  /** Customer and service, as the picker line reads it. */
  label: string;
  /** Date and time, kept on its own line in the picker. */
  detail: string;
  outstanding: number | null;
  total: number | null;
};

export function RecordPaymentModal({
  options,
  loadingOptions = false,
  presetAppointmentId = null,
  onClose,
  onRecorded,
}: {
  options: RecordPaymentOption[];
  loadingOptions?: boolean;
  presetAppointmentId?: string | null;
  onClose: () => void;
  onRecorded: (payment: PaymentRow) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(presetAppointmentId);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amountText, setAmountText] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [amountError, setAmountError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogBehavior<HTMLElement>(onClose);

  const selected = useMemo(
    () => options.find((option) => option.appointmentId === selectedId) ?? null,
    [options, selectedId],
  );

  const matches = useMemo(() => {
    // The search box is an appointment-code input (APT- + typed); the typed
    // tail still matches the customer line so scanning stays easy.
    const needle = search.trim().toLowerCase();
    const tail = needle.startsWith('apt-') ? needle.slice(4) : needle;
    const pool = needle
      ? options.filter((option) =>
          option.appointmentCode.toLowerCase().includes(needle) ||
          option.label.toLowerCase().includes(tail))
      : options;
    return pool.slice(0, 8);
  }, [options, search]);

  // The ceiling on the amount field: the server's outstanding figure when it
  // is known, otherwise the appointment total as the only other server figure.
  const maxOutstanding = selected ? selected.outstanding : null;

  function changeAmount(value: string) {
    setAmountText(value);
    // An empty field is not an error until the form is sent.
    setAmountError(value.trim() ? (recordAmountError(value, maxOutstanding) ?? '') : '');
  }

  async function submit() {
    if (!selected) return;
    const error = recordAmountError(amountText, maxOutstanding);
    setAmountError(error ?? '');
    if (error) return;
    setBusy(true);
    setFormError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const body: Record<string, unknown> = {
        appointmentId: selected.appointmentId,
        method,
        amount: Number(amountText.trim()),
      };
      if (method === 'GCASH' && referenceNo.trim()) body.referenceNo = referenceNo.trim();
      const response = await apiFetch(`${baseUrl}/payments/in-person`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(getAccessToken()) },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? payload?.message ?? 'The payment could not be recorded.');
      }
      onRecorded(toPaymentRow(payload?.data?.payment));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The payment could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="record-payment-title" onClick={onClose}>
      <section ref={dialogRef} className="modal-card payment-modal record-payment-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="record-payment-title">Record payment</h3>
          <button type="button" className="close-button" aria-label="Close record payment" onClick={onClose}>×</button>
        </div>
        <p className="form-hint">Record money received at the counter. The server checks the outstanding balance before the payment is stored.</p>

        {!selected ? (
          <div className="record-appointment-picker">
            <AppointmentCodeInput
              label="APPOINTMENT"
              value={search}
              onChange={setSearch}
              placeholder="52C86F7E…"
            />
            {loadingOptions ? (
              <p className="empty-list">Loading appointments…</p>
            ) : matches.length === 0 ? (
              <p className="empty-list">No appointments match this search.</p>
            ) : (
              <ul className="record-appointment-list">
                {matches.map((option) => (
                  <li key={option.appointmentId}>
                    <button
                      type="button"
                      className="record-appointment-option"
                      onClick={() => {
                        setSelectedId(option.appointmentId);
                        setAmountError(amountText.trim() ? (recordAmountError(amountText, option.outstanding) ?? '') : '');
                      }}
                    >
                      <strong>{option.appointmentCode}</strong>
                      <span>{option.label}</span>
                      <small>{option.detail}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="record-payment-form">
            <div className="record-appointment-chosen">
              <div>
                <strong>{selected.appointmentCode}</strong>
                <span>{selected.label}</span>
                <small>{selected.detail}</small>
              </div>
              <button type="button" className="secondary-action" onClick={() => { setSelectedId(null); setSearch(''); }}>
                Change appointment
              </button>
            </div>

            <label className="field-label" htmlFor="record-payment-method">METHOD</label>
            <select
              id="record-payment-method"
              className="modal-input"
              value={method}
              onChange={(event) => setMethod(event.target.value === 'GCASH' ? 'GCASH' : 'CASH')}
            >
              <option value="CASH">Cash</option>
              <option value="GCASH">GCash</option>
            </select>

            <label className="field-label" htmlFor="record-payment-amount">AMOUNT RECEIVED</label>
            <input
              id="record-payment-amount"
              className="modal-input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => changeAmount(event.target.value)}
              {...invalidField('record-payment-amount-error', amountError)}
            />
            <p className="form-hint">
              {selected.outstanding !== null
                ? `Outstanding balance: ${formatMoney(selected.outstanding)}.`
                : `Appointment total: ${selected.total !== null ? formatMoney(selected.total) : '—'}.`}
              {' '}The server re-checks the amount against the outstanding balance.
            </p>
            <FieldError id="record-payment-amount-error" message={amountError} />

            {method === 'GCASH' && (
              <>
                <label className="field-label" htmlFor="record-payment-reference">GCASH REFERENCE (OPTIONAL)</label>
                <input
                  id="record-payment-reference"
                  className="modal-input"
                  type="text"
                  autoComplete="off"
                  maxLength={60}
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="Reference number from the GCash receipt"
                />
              </>
            )}

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
              <button type="button" className="primary-action" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
