function OurStory() {
  return (
    <section
      className="mx-auto grid w-[min(100%-48px,1180px)] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-center gap-[clamp(40px,7vw,90px)] py-28 max-[900px]:gap-9 max-[680px]:w-[min(100%-36px,1180px)] max-[680px]:grid-cols-1 max-[680px]:gap-8 max-[680px]:py-19.5"
      id="about"
    >
      <div className="h-[min(570px,48vw)] min-h-92.5 overflow-hidden rounded-lg max-[900px]:h-130 max-[680px]:h-[82vw] max-[680px]:min-h-70 max-[680px]:max-h-115">
        <img
          className="block size-full object-cover"
          src="/images/about/our-story.jpeg"
          alt="Stylist carefully curling a client's hair"
        />
      </div>
      <div>
        <div className="mb-4 text-[13px] font-medium tracking-[0.22em] text-(--muted) opacity-75">
          004.
        </div>
        <span className="type-section-eyebrow mb-3.75 inline-block text-(--gold)">
          OUR STORY
        </span>
        <h2 className="type-section-heading m-0 mb-6 text-[#f6f2ea]">
          Crafting Beauty
          <span className="mt-1 block italic text-(--gold)">Since 2018</span>
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
        <blockquote className="my-6 mb-6.5 border-l-2 border-(--gold) bg-[#141311] px-5 py-4.25">
          <p className="type-quote mb-2.25 text-(--gold)">
            “We don&apos;t just style hair and nails — we craft confidence.”
          </p>
          <cite className="type-quote-attribution not-italic text-[#a7a198]">
            — Founder, Royalty Hair and Nails Studio
          </cite>
        </blockquote>
        {/* No studio-stats endpoint exists yet (FE gap) — the fabricated
            numbers were removed (matching the About page) rather than
            replaced with invented ones. */}
        <p className="m-0 text-[13px] leading-[1.7] text-[#a7a198]" role="status">
          Studio statistics are not available yet.
        </p>
      </div>
    </section>
  )
}

export default OurStory
