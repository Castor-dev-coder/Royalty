import { useState } from 'react'

const fallbackImage = '/images/hero.jpg'

function SafeImage({ src, alt, ...props }) {
  const [imageSource, setImageSource] = useState(src || fallbackImage)

  function handleError() {
    if (imageSource !== fallbackImage) setImageSource(fallbackImage)
  }

  return <img {...props} src={imageSource} alt={alt} onError={handleError} />
}

export default SafeImage