import logo from '../assets/logo.png'

function BrandMark({ className = '' }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`object-contain ${className}`}
      src={logo}
    />
  )
}

export default BrandMark