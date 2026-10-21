import BrandMark from './BrandMark.jsx'
import { Link } from 'react-router-dom'

const signedOutLinks = [
  { label: 'Home', to: '/' }, { label: 'Services', to: '/services' },
  { label: 'Reviews', to: '/reviews' },
  { label: 'About', to: '/about' },
]
const signedInLinks = [
  { label: 'Services', to: '/services' },
  { label: 'Appointments', to: '/appointments' },
  { label: 'Reviews', to: '/reviews' },
]

const contactDetails = [
  {
    label: 'EMAIL',
    value: 'royaltysalon@gmail.com',
    href: 'mailto:royaltysalon@gmail.com',
    icon: 'email',
  },
  {
    label: 'PHONE',
    value: '+63 9XX XXX XXXX',
    href: 'tel:+639XXXXXXXXX',
    icon: 'phone',
  },
  {
    label: 'ADDRESS',
    value: 'Caloocan City, Philippines',
    icon: 'location',
  },
]

function ContactIcon({ type }) {
  if (type === 'phone') {
    return (
      <svg className="size-3.75 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.4]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h3l2 5-2 2a15 15 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2A16 16 0 0 1 4 5c0-1 1-2 2-2Z" />
      </svg>
    )
  }

  if (type === 'location') {
    return (
      <svg className="size-3.75 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.4]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </svg>
    )
  }

  return (
    <svg className="size-3.75 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-[1.4]" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

 // eslint-disable-next-line no-unused-vars
 function Footer({ onLoginClick, user }) {
  const quickLinks = user ? signedInLinks : signedOutLinks
  return (
    <footer className="site-footer border-t border-[rgba(212,180,92,0.18)] bg-[#080808] pt-13.75">
      <div className="mx-auto grid w-[min(100%-48px,1180px)] grid-cols-[1.35fr_0.7fr_1fr] gap-[clamp(40px,8vw,120px)] pb-11 max-[680px]:grid-cols-2 max-[680px]:gap-x-6 max-[680px]:gap-y-9.5 max-[600px]:w-[min(100%-36px,1180px)]">
        <div className="max-[680px]:col-span-full">
          <a className="flex items-center gap-2 text-(--text) no-underline" href="#home">
            <BrandMark className="size-9.25" />
            <span className="flex flex-col leading-[1.15]">
              <strong className="type-brand-name text-(--gold)">
                Royalty
              </strong>
              <small className="type-brand-caption mt-0.75 text-[#c7c1b4]">
                HAIR &amp; NAILS STUDIO
              </small>
            </span>
          </a>
          <p className="type-footer-tagline my-4.25 mb-2.5 text-(--gold)">
            Where Beauty Meets Royalty.
          </p>
          <p className="type-footer-description max-w-77.5 text-[#aaa69d]">
            A premier luxury salon in Quezon City dedicated to making every
            client feel like royalty.
          </p>
          <div className="mt-4.5 flex gap-2.5" aria-label="Social media">
            <a className="grid size-8.5 place-items-center rounded-full border border-[rgba(212,180,92,0.56)] text-(--gold) transition-colors duration-180 hover:bg-[rgba(212,180,92,0.14)]" href="https://www.instagram.com/" aria-label="Instagram">
              <svg className="size-3.75 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle className="fill-current stroke-none" cx="18" cy="6" r="1" />
              </svg>
            </a>
            <a className="grid size-8.5 place-items-center rounded-full border border-[rgba(212,180,92,0.56)] text-(--gold) transition-colors duration-180 hover:bg-[rgba(212,180,92,0.14)]" href="https://www.facebook.com/" aria-label="Facebook">
              <svg className="size-3.75 fill-current stroke-none stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.4c-.4-.1-1.8-.2-3.4-.2C11.2 1.2 9 3.2 9 7v2H6v4h3v8h5Z" />
              </svg>
            </a>
          </div>
        </div>

        <div>
          <h2 className="type-footer-heading my-2 mb-5 text-(--gold)">
            QUICK LINKS
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3.25 p-0">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <Link
                  className="type-footer-text cursor-pointer text-[#b8b3aa] no-underline transition-colors duration-180 hover:text-(--gold)"
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                  to={link.to}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="type-footer-heading my-2 mb-5 text-(--gold)">
            CONTACT US
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3.25 p-0">
            {contactDetails.map(({ label, value, href, icon }) => (
              <li
                className="type-footer-text flex items-start gap-3 text-[#c0bbb2]"
                key={label}
              >
                <span className="grid h-4.5 w-4 shrink-0 place-items-center text-center text-(--gold)">
                  <ContactIcon type={icon} />
                </span>
                <span className="flex flex-col">
                  <small className="type-footer-caption text-[#a79f8e]">
                    {label}
                  </small>
                  {href ? (
                    <a className="text-inherit no-underline" href={href}>
                      {value}
                    </a>
                  ) : (
                    <span>{value}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="type-copyright mx-auto w-[min(100%-48px,1180px)] border-t border-[rgba(212,180,92,0.14)] py-4 text-center text-[#88847c] max-[600px]:w-[min(100%-36px,1180px)]">
        © 2026 Royalty Hair and Nails Studio. All rights reserved.
      </div>
    </footer>
  )
}

export default Footer
