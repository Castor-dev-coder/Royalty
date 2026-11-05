// Privacy Policy — linked from the sign-up consent checkboxes (opens in a new
// tab so the registration form is not lost). Draft copy: legal review and salon
// contact details are still to be confirmed before launch.

function LegalSection({ number, title, children }) {
  return (
    <section className="mt-9">
      <h2 className="font-(--serif) text-xl text-[#f3eee5]">
        <span className="mr-3 text-[var(--gold)]">{number}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-[1.75] text-[#c0bbb2]">{children}</div>
    </section>
  )
}

function PrivacyPolicy() {
  return (
    <main className="mx-auto w-[min(100%-48px,880px)] pb-24 pt-14 max-[600px]:w-[min(100%-36px,880px)]">
      <p className="text-[13px] font-medium tracking-[0.22em] text-[var(--muted)] opacity-60">001.</p>
      <span className="type-section-eyebrow text-[var(--gold)]">Legal</span>
      <h1 className="mt-3 font-(--serif) text-[clamp(2rem,5vw,3rem)] italic text-[#f6f2ea]">
        Privacy Policy
      </h1>
      <div className="my-[18px] h-0.5 w-12 bg-[var(--gold)]" />
      <p className="text-sm text-[var(--muted)]">Last updated: November 2026</p>

      <LegalSection number="01" title="What we collect">
        <p>
          When you create an account we collect your name, email address, phone number, and
          your password (stored only in encrypted form). When you book, we collect the
          appointment details you choose: service, date, time, and preferred stylist.
        </p>
      </LegalSection>

      <LegalSection number="02" title="How we use your information">
        <p>
          We use your data to manage your bookings, send appointment confirmations and
          reminders, process payments, show your appointment history, and support reviews
          you choose to leave. We do not sell your personal data.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Payments">
        <p>
          Online payments are handled by Maya. Card and wallet credentials go directly to
          the payment provider — we receive only the transaction status and reference
          numbers needed to reconcile your booking. Card or wallet credentials are never
          stored on our systems.
        </p>
      </LegalSection>

      <LegalSection number="04" title="What salon staff can see">
        <p>
          Salon staff see the information needed to serve you: your name, contact details,
          appointment history, and any notes tied to your bookings. Payment verification is
          limited to authorised staff.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Retention">
        <p>
          Account and booking records are kept while your account is active and for as long
          as needed for business and legal record-keeping. You may request deletion of your
          account and personal data, subject to records we are required to keep.
        </p>
      </LegalSection>

      <LegalSection number="06" title="Security">
        <p>
          We use industry-standard measures to protect your data, including encrypted
          password storage and secure transport (HTTPS). No system is perfectly secure, so
          please choose a strong password and tell us if you suspect misuse of your account.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Your rights">
        <p>
          You can access and correct your profile information from your account settings at
          any time. To request a copy of your data or its deletion, ask at the salon front
          desk or through the contact channels on our About page.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Cookies and local storage">
        <p>
          We use essential browser storage to keep you signed in and to remember interface
          preferences such as theme choice. These are not used for cross-site advertising
          tracking.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected on
          this page with a new revision date.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Contact">
        <p>
          Privacy questions can be raised at the salon front desk or through the contact
          channels listed on our About page.
        </p>
      </LegalSection>
    </main>
  )
}

export default PrivacyPolicy
