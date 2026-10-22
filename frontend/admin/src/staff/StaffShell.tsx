import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { clearAccessTokens, getAccessToken } from '../api';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { CalendarIcon, DashboardIcon, ServicesIcon, StaffIcon, UserIcon } from '../components/icons';
import { SignOutControl } from '../components/SignOutControl';
import { clearAccountSession } from '../session';
import { StaffSignIn } from './StaffSignIn';

/**
 * The staff member's own shell.
 *
 * The navigation here is the staff member's own set of areas and it is
 * deliberately different from the administrator's navigation. No administrator
 * area appears in it: account management, staff management, service pricing
 * and payment verification are administrator capabilities, and this shell does
 * not offer a way into them.
 */

const staffNavItems = [
  { label: 'My Day', to: '/my', Icon: DashboardIcon, end: true },
  { label: 'My Appointments', to: '/my/appointments', Icon: CalendarIcon, end: false },
  { label: 'My Schedule', to: '/my/schedule', Icon: CalendarIcon, end: false },
  { label: 'My Services', to: '/my/services', Icon: ServicesIcon, end: false },
  { label: 'My Profile', to: '/my/profile', Icon: UserIcon, end: false },
];

const pageTitles: Record<string, { title: string; description: string }> = {
  '/my': {
    title: 'My Day',
    description: 'Your bookings, the services you can perform, and your current availability.',
  },
  '/my/appointments': {
    title: 'My Appointments',
    description: 'Only the bookings assigned to you. Confirm a reservation or close out a finished appointment.',
  },
  '/my/schedule': {
    title: 'My Schedule',
    description: 'Your recurring working days and the schedule changes you have requested.',
  },
  '/my/services': {
    title: 'My Services',
    description: 'The salon services you are currently assigned to perform.',
  },
  '/my/profile': {
    title: 'My Profile',
    description: 'Your details, your sign-in access, and your availability.',
  },
};

export function StaffShell() {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        mobileNavToggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  const page = pageTitles[location.pathname] ?? pageTitles['/my'];

  if (!isAuthenticated) {
    return <StaffSignIn onSignedIn={() => { setIsAuthenticated(true); window.location.reload(); }} />;
  }

  return (
    <div className="page-bg">
      <div className="viewer-shell">
        <button
          ref={mobileNavToggleRef}
          type="button"
          className="mobile-nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="staff-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
          <div className="brand-wrap sidebar-brand">
            <div className="brand-mark" aria-hidden="true"><img src="/images/Logo.jpg" alt="" /></div>
            <div>
              <h1>ROYALTY SALON</h1>
              <p>STAFF PANEL</p>
            </div>
          </div>
          <nav className="nav" id="staff-navigation" aria-label="Staff navigation">
            {staffNavItems.map(({ label, to, Icon, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setMobileNavOpen(false)}
              >
                <span className="nav-icon" aria-hidden="true"><Icon /></span>
                {label}
              </NavLink>
            ))}
          </nav>
          <SignOutControl
            label="Staff member"
            initials="ST"
            onSignOut={() => {
              clearAccessTokens();
              clearAccountSession();
              setIsAuthenticated(false);
              // Sign out to the administrator sign-in, which shows both the
              // administrator and the staff demo accounts. Sending the visitor
              // to the staff page here would hide the administrator
              // credentials behind a staff-only screen.
              window.location.assign('/');
            }}
          />
        </aside>

        <main className="content-panel">
          <section className="page-header">
            <div>
              <p className="page-eyebrow">Royalty Salon</p>
              <h2>{page.title}</h2>
              <p>{page.description}</p>
            </div>
            <div className="page-header-actions">
              <ThemeSwitch />
            </div>
          </section>

          <div className="route-content staff-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
