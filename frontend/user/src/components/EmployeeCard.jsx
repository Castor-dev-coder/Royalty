import SafeImage from './SafeImage.jsx'

function EmployeeCard({ name, role, image, alt, bio, specialties }) {
  return (
    <article className="grid grid-cols-1 gap-5 rounded-[10px] border border-[var(--gold)] bg-[#0b0b0b] p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-[30px] lg:p-[26px] xl:grid-cols-[230px_minmax(0,1fr)] min-[1400px]:!grid-cols-[265px_minmax(0,1fr)]">
      <SafeImage
        alt={alt}
        className="h-[300px] w-full rounded-[16px] object-cover object-center sm:h-full sm:min-h-[300px] lg:h-auto lg:w-[265px] lg:min-h-0 lg:max-w-full"
        src={image}
      />
      <div className="flex flex-col items-start">
        <h3 className="m-0 font-[family-name:var(--font-serif)] text-[clamp(26px,2.84vw,41px)] leading-[1.1] font-semibold italic text-[var(--gold)]">
          {name}
        </h3>
        <p className="mt-[18px] mb-0 font-[family-name:var(--font-salon)] text-[clamp(14px,1.47vw,21px)] leading-[1.25] font-medium text-[#f0ede7]">
          {role}
        </p>
        <span aria-hidden="true" className="mt-[20px] h-[2px] w-[44px] bg-[var(--gold)]" />
        <p className="mt-[30px] mb-0 font-[family-name:var(--font-salon)] text-[clamp(14px,1.37vw,19.7px)] leading-[1.58] text-[#c2beb6] lg:max-w-[255px]">
          {bio}
        </p>
        <p className="mt-[24px] mb-0 whitespace-pre-line font-[family-name:var(--font-salon)] text-[clamp(13px,1.27vw,18.2px)] leading-[1.65] text-[#aaa69e] lg:max-w-[255px]">
          {specialties}
        </p>
      </div>
    </article>
  )
}

export default EmployeeCard
