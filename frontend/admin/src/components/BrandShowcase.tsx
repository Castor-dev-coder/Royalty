import { useEffect, useRef, useState } from 'react';

type Slide = {
  src: string;
  alt: string;
  caption: string;
};

/**
 * The approved salon photography that ships with the admin interface.
 * Source of truth: frontend/user/public/images (already reviewed and tracked
 * in this repository). Replaceable: swap the files in
 * frontend/admin/public/images and keep the same names.
 */
const SLIDES: Slide[] = [
  {
    src: '/images/salon-coloring.jpg',
    alt: 'A stylist applying a lightening product to a seated client in a salon.',
    caption: 'Color and treatment services, handled in-house.',
  },
  {
    src: '/images/salon-styling.jpg',
    alt: 'A client with long highlighted hair having a section curled with a heated styling iron.',
    caption: 'Cuts, curls and finishes by our resident team.',
  },
  {
    src: '/images/salon-hero.jpg',
    alt: 'A client with long glossy waves in a low-key salon portrait.',
    caption: 'Every appointment managed from one desk.',
  },
];

const ROTATION_MS = 7000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Salon branding panel for the login screen.
 *
 * Purpose: the split-screen login needs to say "this is a salon" before the
 * user reads a single word. Crossfade rather than slide, so the form panel
 * never shifts and the motion stays calm. Auto-advance pauses on hover and on
 * keyboard focus so the content never moves out from under a reader.
 */
export function BrandShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(query.matches);
    handleChange();
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || SLIDES.length < 2) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, paused, reducedMotion]);

  const single = SLIDES.length === 1;
  const current = SLIDES[active] ?? SLIDES[0];

  return (
    <aside
      className="login-showcase"
      aria-label="Royalty Hair and Nails Studio"
      ref={panelRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="login-showcase-media">
        {SLIDES.map((slide, index) => (
          <img
            key={slide.src}
            className={`login-showcase-image${index === active ? ' active' : ''}`}
            src={slide.src}
            alt={index === active ? slide.alt : ''}
            aria-hidden={index === active ? undefined : true}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ))}
        <div className="login-showcase-scrim" aria-hidden="true" />
      </div>

      <div className="login-showcase-content">
        <p className="login-showcase-overline">Royalty Hair &amp; Nails Studio</p>
        <h2 className="login-showcase-title">Care, scheduled beautifully.</h2>
        <p className="login-showcase-copy">
          Appointments, services, staff schedules and payments for the whole
          studio, in one place.
        </p>
        <p className="login-showcase-caption">{current.caption}</p>

        {!single && (
          <div className="login-showcase-controls">
            <ul className="login-showcase-dots">
              {SLIDES.map((slide, index) => (
                <li key={slide.src}>
                  <button
                    type="button"
                    className={`login-showcase-dot${index === active ? ' active' : ''}`}
                    aria-current={index === active ? 'true' : undefined}
                    aria-label={`Show photo ${index + 1} of ${SLIDES.length}`}
                    onClick={() => setActive(index)}
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="login-showcase-pause"
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? 'Resume slideshow' : 'Pause slideshow'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
