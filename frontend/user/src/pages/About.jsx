import { useEffect, useState } from 'react'
import SafeImage from '../components/SafeImage.jsx'
import WaveDivider from '../components/WaveDivider.jsx'
import { fetchTeam } from '../lib/api.js'

// Initials placeholder for team members without a photo.
function initialsFor(member) {
  const initials = `${member.firstName?.trim()?.[0] ?? ''}${member.lastName?.trim()?.[0] ?? ''}`.toUpperCase()
  return initials || '?'
}

function fullNameFor(member) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || 'Our team'
}

function About() {
  const [team, setTeam] = useState([])
  const [teamStatus, setTeamStatus] = useState('loading') // loading | ready | empty

  // Public team roster (GET /staff/team, no auth). The card renders only the
  // team-visible fields — never email or phone.
  useEffect(() => {
    let stale = false
    fetchTeam().then(
      (data) => {
        if (stale) return
        const rows = data?.staff ?? []
        setTeam(rows)
        setTeamStatus(rows.length > 0 ? 'ready' : 'empty')
      },
      () => {
        if (!stale) setTeamStatus('empty')
      },
    )
    return () => {
      stale = true
    }
  }, [])

  return (
    <main className="min-h-[calc(100vh-76px)] bg-black" id="home">
        <section
          aria-labelledby="about-heading"
          className="mx-auto mb-14 grid w-[calc(100%-48px)] max-w-341 grid-cols-1 items-start gap-8 pt-21.5 pb-0 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] lg:gap-15 max-[680px]:w-[calc(100%-36px)] max-[680px]:gap-7 max-[680px]:pt-9.5 min-[1400px]:!grid-cols-[540px_700px]"
          id="about"
        >
          <div className="aspect-540/664 w-full overflow-hidden rounded-[18px]">
            <SafeImage
              alt="Stylist curling a client's hair in the salon"
              className="block size-full object-cover"
              src="/images/about/our-story.jpeg"
            />
          </div>

          <div>
            <span className="mb-0.75 inline-block font-salon text-base leading-tight font-semibold tracking-[1.3px] text-(--gold) uppercase">
              OUR STORY
            </span>
            <h1
              className="m-0 mb-8 font-serif text-[clamp(42px,3.89vw,56px)] leading-[1.2] font-semibold italic text-[#f6f2ea]"
              id="about-heading"
            >
              Crafting Beauty
              <span className="mt-1 block text-(--gold)">Since 2018</span>
            </h1>
            <p className="mb-6 font-salon text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Founded in the heart of Quezon City, Royalty Hair and Nails Studio
              was born from a simple vision: every person deserves to feel
              extraordinary. For over eight years, we’ve been transforming
              the way our clients see themselves.
            </p>
            <p className="mb-6 font-salon text-[clamp(15.2px,1.32vw,19px)] leading-[1.8] text-[#b9b4aa]">
              Our team of master stylists and nail technicians bring decades of
              combined expertise to every appointment. We use only premium,
              salon-grade products to ensure results that are as long-lasting as
              they are beautiful.
            </p>
            <blockquote className="my-6 mb-13 border-l-[3px] border-(--gold) bg-[#141311] px-6.75 py-4.25">
              <p className="mb-2.25 font-serif text-[clamp(17px,1.46vw,21px)] leading-[1.4] font-medium italic text-(--gold)">
                “We don’t just style hair and nails — we craft confidence.”
              </p>
              <cite className="font-salon text-[clamp(12px,0.97vw,14px)] leading-[1.3] text-[#a7a198] not-italic">
                — Founder, Royalty Hair and Nails Studio
              </cite>
            </blockquote>
            {/* No studio-stats endpoint exists yet (FE gap) — the fabricated
                numbers were removed rather than replaced with invented ones. */}
            <p className="m-0 text-[clamp(13px,1.1vw,15px)] leading-[1.7] text-[#a7a198]" role="status">
              Studio statistics are not available yet.
            </p>
          </div>
        </section>

        <WaveDivider />
        <section
          aria-labelledby="team-heading"
          className="salon-atmosphere pb-16.5 max-[680px]:pb-12"
        >
          <div aria-hidden="true" className="salon-lines" />
          <header className="text-center">
            <span className="mb-0.75 inline-block font-salon text-[17.5px] leading-tight font-semibold tracking-[1.3px] text-(--gold) uppercase">
              OUR TEAM
            </span>
            <h2
              className="m-0 font-serif text-[clamp(42px,5.06vw,73px)] leading-[1.05] font-semibold italic text-[#f6f2ea]"
              id="team-heading"
            >
              Meet Our <span className="text-(--gold)">Team</span>
            </h2>
            <p className="mt-5 mb-0 font-salon text-[clamp(16px,1.67vw,24px)] leading-[1.35] text-[#c8c3bb]">
              Skilled. Passionate. Dedicated to your beauty.
            </p>
          </header>

          {teamStatus === 'loading' && (
            <p className="mx-auto mt-19 max-w-[calc(100%-128px)] text-center text-[clamp(15px,1.3vw,18px)] leading-[1.7] text-[#a7a198] max-[680px]:mt-9.5 max-[680px]:max-w-[calc(100%-36px)]" role="status">
              Loading our team…
            </p>
          )}
          {teamStatus === 'ready' && (
            <ul className="mx-auto mt-19 grid w-[calc(100%-128px)] max-w-341 list-none grid-cols-3 gap-6 p-0 max-[980px]:grid-cols-2 max-[680px]:mt-9.5 max-[680px]:w-[calc(100%-36px)] max-[680px]:grid-cols-1">
              {team.map((member) => {
                const name = fullNameFor(member)
                const specialties = (member.specialties ?? []).map((specialty) => specialty.name).filter(Boolean)
                const coveredRoles = member.coveredRoles ?? []
                return (
                  <li key={member.id}>
                    <article className="flex h-full flex-col gap-4 rounded-[18px] border border-[rgba(212,180,92,0.4)] bg-[#141311] p-7">
                      {member.photoUrl ? (
                        <SafeImage
                          alt={name}
                          className="size-20 rounded-full object-cover"
                          src={member.photoUrl}
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="grid size-20 place-items-center rounded-full border border-(--gold) font-serif text-[26px] leading-none font-semibold text-(--gold)"
                        >
                          {initialsFor(member)}
                        </div>
                      )}
                      <div>
                        <h3 className="m-0 font-serif text-[22px] leading-tight text-[#f6f2ea]">{name}</h3>
                        {member.position && (
                          <p className="m-0 mt-1.5 text-[12px] font-semibold tracking-[1.3px] text-(--gold) uppercase">
                            {member.position}
                          </p>
                        )}
                      </div>
                      {specialties.length > 0 && (
                        <p className="m-0 text-sm leading-[1.6] text-[#c8c3bb]">{specialties.join(' · ')}</p>
                      )}
                      {coveredRoles.length > 0 && (
                        <p className="m-0 text-[11px] leading-[1.6] tracking-[1.2px] text-[#8d877c] uppercase">
                          Covers {coveredRoles.join(' · ')}
                        </p>
                      )}
                      {member.bio && (
                        <p className="m-0 text-[14px] leading-[1.7] text-[#a7a198]">{member.bio}</p>
                      )}
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
          {teamStatus === 'empty' && (
            <p className="mx-auto mt-19 max-w-[calc(100%-128px)] text-center text-[clamp(15px,1.3vw,18px)] leading-[1.7] text-[#a7a198] max-[680px]:mt-9.5 max-[680px]:max-w-[calc(100%-36px)]" role="status">
              Our team profiles are not available yet.
            </p>
          )}
        </section>
    </main>
  )
}

export default About
