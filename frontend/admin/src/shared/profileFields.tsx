import { useId, useState } from 'react';

/**
 * The small pickers shared by the account-creation and staff-edit forms:
 * covered-role tags, the specialty checkboxes, and the show-on-team toggle.
 */

/** A tag multi-select over a fixed vocabulary, with custom tags allowed. */
export function TagMultiSelect({ label, options, value, onChange, hint, errorId, errorMessage }: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  errorId?: string;
  errorMessage?: string;
}) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  }

  return (
    <div className="tag-picker-field">
      <span className="field-label">{label}</span>
      {hint && <p className="form-hint">{hint}</p>}
      {value.length > 0 && (
        <ul className="tag-picker" aria-label={label}>
          {value.map((tag) => (
            <li key={tag} className="tag-chip">
              <span>{tag}</span>
              <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <ul className="tag-suggestions" aria-label={`${label} suggestions`}>
        {options.filter((option) => !value.includes(option)).map((option) => (
          <li key={option}>
            <button type="button" className="tag-suggestion" aria-label={`Add ${option}`} onClick={() => addTag(option)}>+ {option}</button>
          </li>
        ))}
      </ul>
      <div className="tag-add-row">
        <input
          id={inputId}
          className="modal-input"
          type="text"
          maxLength={100}
          placeholder="Add another role…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag(draft);
            }
          }}
          aria-describedby={errorMessage && errorId ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
        />
        <button type="button" className="secondary-action" onClick={() => addTag(draft)}>Add</button>
      </div>
      {errorMessage && <p className="field-error" id={errorId} role="alert">{errorMessage}</p>}
    </div>
  );
}

/** A checkbox per option — used for the service categories a staff member covers. */
export function CheckboxMultiSelect({ label, options, value, onChange, errorId, errorMessage }: {
  label: string;
  options: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (next: string[]) => void;
  errorId?: string;
  errorMessage?: string;
}) {
  return (
    <fieldset className="specialty-field" aria-describedby={errorMessage && errorId ? errorId : undefined}>
      <legend className="field-label">{label}</legend>
      {options.length === 0 && <p className="form-hint">No service categories are available yet.</p>}
      <div className="specialty-grid">
        {options.map((option) => {
          const checked = value.includes(option.id);
          return (
            <label key={option.id} className="specialty-option">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((id) => id !== option.id) : [...value, option.id])}
              />
              <span>{option.name}</span>
            </label>
          );
        })}
      </div>
      {errorMessage && <p className="field-error" id={errorId} role="alert">{errorMessage}</p>}
    </fieldset>
  );
}

/** A labelled on/off switch. */
export function ToggleSwitch({ label, hint, checked, onChange, disabled = false }: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-field">
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        <span>{label}</span>
      </label>
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}
