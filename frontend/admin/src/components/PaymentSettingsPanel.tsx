import { useEffect, useRef, useState } from 'react';
import { apiFetch, authHeader, getAccessToken } from '../api';
import { ImageUploadField, type ImageUploadHandle } from '../shared/imageUpload';
import { FieldError, invalidField } from '../shared/ui';
import {
  DEFAULT_DOWN_PAYMENT_KIND,
  DEFAULT_DOWN_PAYMENT_VALUE,
  describeDownPayment,
  settingsFormErrors,
  toPaymentSettings,
  type DownPaymentKind,
  type PaymentSettings,
  type PaymentSettingsForm,
} from '../payments';

/**
 * The GCash payment settings, for administrators only.
 *
 * The QR code is uploaded as raw image bytes to its own endpoint, and the
 * remaining fields are saved together through the settings endpoint. The
 * API is the authority on who may save: this panel is rendered for an
 * administrator session and every request is checked again on the server.
 */
export function PaymentSettingsPanel() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<PaymentSettingsForm>({
    receiverName: '',
    accountNumberMasked: '',
    downPaymentKind: DEFAULT_DOWN_PAYMENT_KIND,
    downPaymentValue: String(DEFAULT_DOWN_PAYMENT_VALUE),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const qrRef = useRef<ImageUploadHandle | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    apiFetch(`${baseUrl}/payments/settings`, { signal: controller.signal, headers: authHeader(getAccessToken()) })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Payment settings are not available.');
        const loaded = toPaymentSettings(payload?.data?.settings);
        setSettings(loaded);
        setForm(fromSettings(loaded));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Payment settings are not available.');
      });
    return () => controller.abort();
  }, []);

  function changeField<K extends keyof PaymentSettingsForm>(field: K, value: PaymentSettingsForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function save() {
    const errors = settingsFormErrors(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setSaveError('');
    setNotice('');
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    try {
      // The QR image goes to its own endpoint as raw bytes; the text fields
      // are saved after it so the response of the last write is what shows.
      if (qrRef.current?.hasPendingFile()) {
        await qrRef.current.upload(`${baseUrl}/payments/settings/qr`);
      }
      const response = await apiFetch(`${baseUrl}/payments/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader(getAccessToken()) },
        body: JSON.stringify({
          receiverName: form.receiverName.trim(),
          accountNumberMasked: form.accountNumberMasked.trim(),
          downPaymentKind: form.downPaymentKind,
          downPaymentValue: form.downPaymentKind === 'NONE' ? 0 : Number(form.downPaymentValue.trim()),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'The payment settings could not be saved.');
      const saved = toPaymentSettings(payload?.data?.settings);
      setSettings(saved);
      setForm(fromSettings(saved));
      setNotice('Payment settings saved.');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'The payment settings could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel payment-settings-panel">
      <div className="panel-header compact">
        <h3>GCash Payment Settings</h3>
        <span>Shown to customers who pay online</span>
      </div>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {settings && !settings.configured && (
        <div className="payment-unavailable" role="status">
          <strong>Not configured</strong>
          <p>Customers cannot pay online yet. Upload the GCash QR code and save the receiver details below to enable online payments.</p>
        </div>
      )}
      {notice && <p className="table-message" role="status">{notice}</p>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}

      <div className="payment-settings-form">
        <ImageUploadField ref={qrRef} label="GCash QR code" idPrefix="payment-qr" initialUrl={settings?.gcashQrUrl ?? null} disabled={busy} />

        <label className="field-label" htmlFor="payment-settings-receiver">RECEIVER NAME</label>
        <input
          id="payment-settings-receiver"
          className="modal-input"
          type="text"
          autoComplete="off"
          maxLength={100}
          value={form.receiverName}
          onChange={(event) => changeField('receiverName', event.target.value)}
          {...invalidField('payment-settings-receiver-error', fieldErrors.receiverName)}
        />
        <FieldError id="payment-settings-receiver-error" message={fieldErrors.receiverName} />

        <label className="field-label" htmlFor="payment-settings-account">MASKED ACCOUNT NUMBER</label>
        <input
          id="payment-settings-account"
          className="modal-input"
          type="text"
          autoComplete="off"
          maxLength={40}
          value={form.accountNumberMasked}
          onChange={(event) => changeField('accountNumberMasked', event.target.value)}
          placeholder="0917 *** 4567"
          {...invalidField('payment-settings-account-error', fieldErrors.accountNumberMasked)}
        />
        <p className="form-hint">Shown to customers as the account to send to. Mask it the way a receipt does.</p>
        <FieldError id="payment-settings-account-error" message={fieldErrors.accountNumberMasked} />

        <label className="field-label" htmlFor="payment-settings-kind">DOWN PAYMENT</label>
        <select
          id="payment-settings-kind"
          className="modal-input"
          value={form.downPaymentKind}
          onChange={(event) => changeField('downPaymentKind', event.target.value as DownPaymentKind)}
        >
          <option value="NONE">No down payment</option>
          <option value="FIXED">Fixed amount</option>
          <option value="PERCENT">Percentage of the total</option>
        </select>

        {form.downPaymentKind !== 'NONE' && (
          <>
            <label className="field-label" htmlFor="payment-settings-value">
              {form.downPaymentKind === 'PERCENT' ? 'DOWN PAYMENT PERCENTAGE' : 'DOWN PAYMENT AMOUNT'}
            </label>
            <input
              id="payment-settings-value"
              className="modal-input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.downPaymentValue}
              onChange={(event) => changeField('downPaymentValue', event.target.value)}
              readOnly={form.downPaymentKind === 'PERCENT'}
              title={form.downPaymentKind === 'PERCENT' ? 'The deposit percentage is one server-side setting.' : undefined}
              {...invalidField('payment-settings-value-error', fieldErrors.downPaymentValue)}
            />
            <FieldError id="payment-settings-value-error" message={fieldErrors.downPaymentValue} />
          </>
        )}

        {settings && (
          <p className="payment-hint">
            Currently saved: {describeDownPayment(settings.downPaymentKind, settings.downPaymentValue)}
            {settings.receiverName ? ` · ${settings.receiverName}` : ''}
            {settings.accountNumberMasked ? ` · ${settings.accountNumberMasked}` : ''}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The form starts from the saved settings, or from the display default. */
function fromSettings(settings: PaymentSettings): PaymentSettingsForm {
  return {
    receiverName: settings.receiverName,
    accountNumberMasked: settings.accountNumberMasked,
    downPaymentKind: settings.downPaymentKind,
    downPaymentValue: String(settings.downPaymentValue ?? DEFAULT_DOWN_PAYMENT_VALUE),
  };
}
