import { useEffect, useRef, useState } from 'react'
import ImageLightbox from './ImageLightBox.jsx'
import SafeImage from './SafeImage.jsx'

// Three continuously drifting rows built from the salon's own gallery photos.
// Rows alternate direction (left→right, right→left, left→right) with slightly
// different durations so they never look mechanically synchronized. The second
// copy of each group is the seamless-loop twin: hidden from assistive tech and
// removed from the tab order, but still clickable with a pointer.
const rowConfig = [
  { id: 'hair', label: 'Hair Services', move: 'right', duration: 78 },
  { id: 'barber', label: 'Men’s Grooming & Barber', move: 'left', duration: 88 },
  { id: 'beauty', label: 'Nails & Beauty', move: 'right', duration: 82 },
]

function GalleryMarquee({ images }) {
  const rootRef = useRef(null)
  const [userPaused, setUserPaused] = useState(false)
  const [inView, setInView] = useState(true)
  const [zoomedImage, setZoomedImage] = useState(null)

  // Drifting is stopped entirely while the gallery is off-screen.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  function openTile(image, alt) {
    // Pause before the tile's own action runs so the row can never slide away
    // between pointer-down and the click.
    setUserPaused(true)
    setZoomedImage({ src: image, alt })
  }

  return (
    <div className="flex flex-col gap-[35px] max-[680px]:gap-[26px]" ref={rootRef}>
      <div className="flex justify-end">
        <button
          aria-label={userPaused ? 'Play gallery animation' : 'Pause gallery animation'}
          className="gallery-pause-control inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full border border-[var(--gold)] bg-transparent px-4 py-1.5 text-[10px] font-bold tracking-[0.14em] text-[var(--gold)] uppercase transition-[background-color,color] duration-[180ms] hover:bg-[var(--gold)] hover:text-[#111]"
          onClick={() => setUserPaused((paused) => !paused)}
          type="button"
        >
          {userPaused ? (
            <svg aria-hidden="true" className="size-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="size-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
          )}
          {userPaused ? 'Play' : 'Pause'}
        </button>
      </div>

      {rowConfig.map((row) => {
        const tiles = [...images[row.id], ...images[row.id]]
        return (
          <div className="gallery-marquee-row" key={row.id}>
            <h3
              className="type-gallery-heading m-0 mb-[14px] text-[#ded9cf]"
              id={`gallery-${row.id}-label`}
            >
              {row.label}
            </h3>
            <div
              aria-labelledby={`gallery-${row.id}-label`}
              className="gallery-marquee"
              data-inview={inView}
              data-paused={userPaused}
              role="group"
            >
              <div
                className="gallery-marquee-track"
                data-move={row.move}
                style={{ '--marquee-duration': `${row.duration}s` }}
              >
                {[false, true].map((duplicate) => (
                  <ul
                    aria-hidden={duplicate ? 'true' : undefined}
                    className="gallery-marquee-group"
                    key={`group-${duplicate ? 'copy' : 'original'}`}
                  >
                    {tiles.map((image, index) => {
                      const alt = `${row.label} salon result ${index + 1}`
                      return (
                        <li key={`${row.id}-${duplicate ? 'copy' : 'orig'}-${index}`}>
                          <button
                            className="gallery-tile aspect-[3/4] w-[226px] max-[600px]:w-[180px]"
                            onClick={() => openTile(image, alt)}
                            tabIndex={duplicate ? -1 : undefined}
                            type="button"
                          >
                            <SafeImage
                              alt={alt}
                              className="block size-full object-cover"
                              src={image}
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      {zoomedImage && (
        <ImageLightbox
          alt={zoomedImage.alt}
          onClose={() => setZoomedImage(null)}
          src={zoomedImage.src}
        />
      )}
    </div>
  )
}

export default GalleryMarquee
