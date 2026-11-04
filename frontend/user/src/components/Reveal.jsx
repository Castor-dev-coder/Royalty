import { useEffect, useRef } from 'react'

// Scroll-triggered reveal: adds `reveal-in` once, the first time the element
// enters the viewport, so the CSS transition (composited opacity/transform
// only) dresses the entrance. Deliberately state-free — the class lands on
// the DOM node directly, keeping the component render-neutral for tests and
// never re-rendering the tree. Without IntersectionObserver the content is
// shown immediately; under prefers-reduced-motion the CSS shows it too.
function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    if (typeof IntersectionObserver !== 'function') {
      element.classList.add('reveal-in')
      return undefined
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in')
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      className={`reveal${className ? ` ${className}` : ''}`}
      ref={ref}
      style={delay ? { '--reveal-delay': `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default Reveal
