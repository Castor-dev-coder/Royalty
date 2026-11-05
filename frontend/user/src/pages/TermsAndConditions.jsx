// Terms & Conditions — linked from the sign-up consent checkboxes (opens in a
// new tab so the registration form is not lost). Draft copy: legal review and
// salon contact details are still to be confirmed before launch.

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

function TermsAndConditions() {
  return (
    <main className="mx-auto w-[min(100%-48px,880px)] pb-24 pt-14 max-[600px]:w-[min(100%-36px,880px)]">
      <p className="text-[13px] font-medium tracking-[0.22em] text-[var(--muted)] opacity-60">001.</p>
      <span className="type-section-eyebrow text-[var(--gold)]">Legal</span>
      <h1 className="mt-3 font-(--serif) text-[clamp(2rem,5vw,3rem)] italic text-[#f6f2ea]">
        Terms &amp; Conditions
      </h1>
      <div className="my-[18px] h-0.5 w-12 bg-[var(--gold)]" />
      <p className="text-sm text-[var(--muted)]">Last updated: November 2026</p>

      <LegalSection number="01" title="About these terms">
        <p>
          These terms govern your use of the Royalty Hair &amp; Nails Studio website and
          booking service. By creating an account or booking an appointment you agree to
          these terms and to our Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Accounts">
        <p>
          You are responsible for keeping your login credentials confidential and for all
          activity that happens under your account. Please provide accurate contact details
          — we use them to confirm and remind you about your appointments.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Bookings and appointment holds">
        <p>
          When you submit a booking, the requested slot is <strong>reserved</strong> for you
          while you complete payment. An online booking is only <strong>confirmed</strong>{" "}
          once payment (or the required down payment) has been received and verified.
        </p>
        <p>
          Reservation holds expire if payment is not completed within the stated hold
          window, in which case the slot is released and may be booked by someone else.
        </p>
      </LegalSection>

      <LegalSection number="04" title="Prices and payments">
        <p>
          All prices are in Philippine pesos (PHP) and include applicable taxes unless
          stated otherwise. Online payments are processed by Maya; we do not see or store
          your card or wallet credentials. Your booking is confirmed only after the payment
          provider confirms the transaction.
        </p>
        <p>
          Where a down payment option is offered, the remaining balance is due at the salon
          before or at the time of your appointment.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Cancellations and rescheduling">
        <p>
          You may cancel or reschedule an upcoming appointment from your Appointments page.
          Please give at least 24 hours' notice where possible so the slot can be offered to
          other clients. Cancellation of bookings that are already paid may be subject to
          review by salon staff.
        </p>
      </LegalSection>

      <LegalSection number="06" title="No-shows">
        <p>
          Repeated no-shows may limit future online booking privileges. Down payments for
          missed appointments may be non-refundable at the salon's discretion.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Reviews and content">
        <p>
          Reviews you submit should reflect genuine experiences. We may remove reviews that
          contain abusive, false, or unrelated content. Service photos published with your
          review may be displayed on the site.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Service outcomes">
        <p>
          Our stylists and nail technicians perform services with professional care. If you
          are unhappy with a result, please tell us during or shortly after your visit so we
          can make it right.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Changes to these terms">
        <p>
          We may update these terms from time to time. Material changes will be reflected on
          this page with a new revision date. Continued use of the booking service after a
          change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Contact">
        <p>
          Questions about these terms can be raised at the salon front desk or through the
          contact channels listed on our About page.
        </p>
      </LegalSection>
    </main>
  )
}

export default TermsAndConditions
