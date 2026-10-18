function ServiceCard({ image, title, price, description, duration, onBook }) {
  return (
    <article className="group overflow-hidden rounded-[6px] border border-[rgba(212,180,92,0.52)] bg-[var(--card)] transition-[transform,box-shadow] duration-[220ms] hover:-translate-y-[5px] hover:shadow-[0_14px_35px_rgba(212,180,92,0.12)] max-[680px]:grid max-[680px]:grid-cols-[minmax(105px,0.8fr)_minmax(0,1.2fr)]">
      <div className="relative aspect-[4/3]! h-auto! min-h-0! w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,#29241a,#151515_55%,#2b2518)] max-[680px]:aspect-auto! max-[680px]:h-full! max-[680px]:min-h-[210px]!">
  <img
    className="absolute inset-0 block size-full object-cover transition-transform duration-[350ms] group-hover:scale-[1.04]"
    src={image}
    alt={`${title} service`}
  />
</div>
      <div className="flex min-h-[206px] flex-col p-[19px_19px_17px] max-[680px]:min-h-[210px] max-[680px]:p-[15px_13px]">
        <div className="flex items-baseline justify-between gap-3 max-[680px]:items-start max-[680px]:flex-col max-[680px]:gap-1">
          <h3 className="type-card-title m-0 text-[#f3eee5]">
            {title}
          </h3>
          <span className="type-card-price shrink-0 text-[var(--gold)]">
            {price}
          </span>
        </div>
        <p className="type-card-body mt-3 text-[#b4b0a8] max-[680px]:mt-[7px]">
          {description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 max-[680px]:gap-[6px] max-[680px]:pt-3">
          <span className="type-caption text-[#aaa59a]">
            {duration}
          </span>
          <button
            className="type-card-button inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-[2px] border border-[var(--gold)] bg-transparent px-4 py-[0.6rem] text-[var(--gold)] no-underline transition-[background-color,color] duration-[180ms] hover:bg-[var(--gold)] hover:text-[#111] max-[680px]:min-h-[34px] max-[680px]:px-[0.65rem]"
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
