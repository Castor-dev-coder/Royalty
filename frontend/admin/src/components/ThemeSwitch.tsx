import { useTheme, type ThemePreference } from '../theme';
import { MoonIcon, SunIcon, SystemIcon } from './icons';

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof SunIcon }> = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: SystemIcon },
];

/**
 * Theme preference control.
 *
 * Purpose: salon owners and managers work long shifts, often in a dim or
 * bright back room, so the interface needs a visible, one-click way to change
 * contrast. Rendered as a radio group so screen readers announce the current
 * choice and arrow keys move between options.
 */
export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="theme-switch">
      <legend className="theme-switch-legend">Appearance</legend>
      <div className="theme-switch-options">
        {OPTIONS.map(({ value, label, Icon }) => (
          <label
            key={value}
            className={`theme-switch-option${preference === value ? ' active' : ''}`}
          >
            <input
              type="radio"
              name="theme-preference"
              value={value}
              checked={preference === value}
              onChange={() => setPreference(value)}
            />
            <Icon className="theme-switch-icon" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
