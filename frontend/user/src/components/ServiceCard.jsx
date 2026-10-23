import SafeImage from './SafeImage.jsx'

function ServiceCard({ image, title, price, description, duration, onBook }) {
  return (
    <article className="service-card group overflow-hidden border border-[rgba(212,180,92,0.52)] bg-[var(--card)]">
      <div className="relative aspect-[4/3]! h-auto! min-h-0! w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,#29241a,#151515_55%,#2b2518)]">
        <SafeImage
          className="absolute inset-0 block size-full object-cover transition-transform duration-[350ms] group-hover:scale-[1.04]"
          src={image}
          alt={`${title} service`}
        />
      </div>
      <div className="flex min-h-[206px] flex-col p-[19px_19px_17px] max-[680px]:min-h-0 max-[680px]:p-[13px_12px_14px]">
        <h3 className="type-card-title m-0 text-[#f3eee5] max-[680px]:min-h-[calc(3_*_1.2em)]">
          {title}
        </h3>
        <p className="service-price">
          {price}
        </p>
        <div
          className="service-description type-card-body mt-2.5 h-[86px] overflow-y-auto text-[#b4b0a8] max-[680px]:mt-[7px] max-[680px]:h-[112px]"
          role="region"
          tabIndex={0}
          aria-label={`Description for ${title}`}
        >
          {description}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 max-[680px]:flex-col max-[680px]:items-stretch max-[680px]:gap-2 max-[680px]:pt-3">
          <span className="type-caption text-[#aaa59a]">
            {duration}
          </span>
          <button
            className="btn-pill type-card-button inline-flex min-h-[38px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--gold)] px-5 py-[0.6rem] text-[#111] no-underline transition-[background-color,color] duration-[180ms] hover:bg-[var(--gold-bright)] hover:text-[#111] max-[680px]:min-h-[38px] max-[680px]:w-full max-[680px]:px-[0.5rem]"
            onClick={onBook}
            type="button"
          >
            BOOK NOW
          </button>
        </div>
      </div>
    </article>
  )
}

export default ServiceCard
