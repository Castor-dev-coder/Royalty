const stats = [
  { value: '500+', label: 'CLIENTS SERVED' },
  { value: '15+', label: 'EXPERT STAFF' },
  { value: '8+', label: 'YEARS OF EXCELLENCE' },
]

function OurStory({ image }) {
  return (
    <section
      className="mx-auto grid w-[min(100%-48px,1180px)] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-center gap-[clamp(40px,7vw,90px)] py-28 max-[900px]:gap-9 max-[680px]:w-[min(100%-36px,1180px)] max-[680px]:grid-cols-1 max-[680px]:gap-8 max-[680px]:py-[78px]"
      id="about"
    >
      <div className="h-[min(570px,48vw)] min-h-[370px] overflow-hidden rounded-lg max-[900px]:h-[520px] max-[680px]:h-[82vw] max-[680px]:min-h-[280px] max-[680px]:max-h-[460px]">
        <img
          className="block size-full object-cover"
          src="/images/about/our-story.jpeg"
          alt="Stylist carefully curling a client's hair"
        />
      </div>
      <div>
        <span className="type-section-eyebrow mb-[15px] inline-block text-[var(--gold)]">
          OUR STORY
        </span>
        <h2 className="type-section-heading m-0 mb-6 text-[#f6f2ea]">
          Crafting Beauty
          <span className="mt-1 block italic text-[var(--gold)]">Since 2018</span>
        </h2>
        <p className="type-story-body mb-4 text-[#b9b4aa]">
          Founded in the heart of Caloocan City, Royalty Hair and Nails Studio
          was born from a simple vision: every person deserves to feel
          extraordinary. For over eight years, we&apos;ve been transforming the
          way our clients see themselves.
        </p>
        <p className="type-story-body mb-4 text-[#b9b4aa]">
          Our team of master stylists and nail technicians bring decades of
          combined expertise to every appointment. We use only premium,
          salon-grade products to ensure results that are as long-lasting as
          they are beautiful.
        </p>
        <blockquote className="my-6 mb-[26px] border-l-2 border-[var(--gold)] bg-[#141311] px-5 py-[17px]">
          <p className="type-quote mb-[9px] text-[var(--gold)]">
            “We don&apos;t just style hair and nails — we craft confidence.”
          </p>
          <cite className="type-quote-attribution not-italic text-[#a7a198]">
            — Founder, Royalty Hair and Nails Studio
          </cite>
        </blockquote>
        <div className="grid grid-cols-3 gap-[18px] max-[380px]:gap-[10px]">
          {stats.map(({ value, label }) => (
            <div className="flex flex-col gap-[7px]" key={label}>
              <strong className="type-stat-value text-[var(--gold)]">
                {value}
              </strong>
              <span className="type-stat-label text-[#a7a198]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default OurStory
