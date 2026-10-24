import { Link } from 'react-router-dom'

// Branded catch-all for unknown routes.
function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-black px-6 py-16 text-center text-[#eeeae2]">
      <p className="m-0 font-[var(--serif)] text-[clamp(4rem,14vw,7.5rem)] leading-none text-[var(--gold)]">404</p>
      <h1 className="m-0 font-[var(--serif)] text-[clamp(1.5rem,4.5vw,2.25rem)] leading-snug">
        This page wandered off.
      </h1>
      <p className="m-0 max-w-[44ch] text-[15px] leading-relaxed text-[#b3ada2]">
        The page you are looking for does not exist or has moved. Let us walk you back.
      </p>
      <Link
        className="btn-pill inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-7 text-[13px] font-bold tracking-[0.12em] text-[#111] uppercase no-underline hover:bg-[var(--gold-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        to="/"
      >
        Back to home
      </Link>
    </div>
  )
}

export default NotFound
