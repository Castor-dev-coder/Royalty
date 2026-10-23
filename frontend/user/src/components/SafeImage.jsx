import { useState } from 'react'

const fallbackImage = '/images/hero.jpg'

// Images are the frontend's genuinely asynchronous content. Until the file
// has loaded, the element shows the shimmer placeholder (.img-skeleton), so
// the layout stays stable and every image has a real loading state.
function SafeImage({ src, alt, ...props }) {
  const [imageSource, setImageSource] = useState(src || fallbackImage)
  const [loaded, setLoaded] = useState(false)

  function handleError() {
    if (imageSource !== fallbackImage) setImageSource(fallbackImage)
  }

  const { className = '', onLoad, ...restProps } = props

  return (
    <img
      {...restProps}
      alt={alt}
      className={`${className}${loaded ? '' : ' img-skeleton'}`.trim()}
      draggable={false}
      onError={handleError}
      onLoad={(event) => {
        setLoaded(true)
        onLoad?.(event)
      }}
      src={imageSource}
    />
  )
}

export default SafeImage