import { useRef, useState } from 'react'
import AuthModal from './AuthModal.jsx'
import BrandMark from './BrandMark.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { ApiError, ValidationError } from '../lib/api.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Mirrors the backend's philippineMobileSchema (validation.ts): 7-20 chars of
// digits/spaces/dashes/parens with an optional leading +.
const PHONE_PATTERN = /^\+?[0-9\s\-()]{7,20}$/

function Signin({ onClose, onSwitch, onLogin = () => {} }) {
  const { signUp } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    // Guards duplicate submissions even before React re-renders.
    if (submittingRef.current) return

    const form = event.currentTarget
    const name = String(form.elements.name.value).trim()
    const email = String(form.elements.email.value).trim()
    const phone = String(form.elements.phone.value).trim()
    const nextErrors = {}
    if (!name) nextErrors.name = 'Enter your name.'
    if (!email) {
      nextErrors.email = 'Enter your email address.'
    } else if (!EMAIL_PATTERN.test(email)) {
      nextErrors.email = 'Enter a valid email address, such as you@example.com.'
    }
    if (!phone) {
      nextErrors.phone = 'Enter your mobile number.'
    } else if (!PHONE_PATTERN.test(phone)) {
      nextErrors.phone = 'Enter a valid mobile number, such as 09XX XXX XXXX.'
    }
    if (!form.elements.password.value) {
      nextErrors.password = 'Create a password.'
    }
    if (!form.elements.confirmPassword.value) {
      nextErrors.confirmPassword = 'Re-enter your password to confirm it.'
    } else if (form.elements.password.value !== form.elements.confirmPassword.value) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }
    setErrors(nextErrors)
    const firstError = Object.keys(nextErrors)[0]
    if (firstError) {
      form.elements[firstError]?.focus()
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setMessage('')
    const [firstName, ...rest] = name.split(/\s+/)
    try {
      const user = await signUp({
        email,
        password: form.elements.password.value,
        firstName,
        lastName: rest.join(' '),
        phone,
      })
      onLogin(user)
      onClose()
    } catch (error) {
      if (error instanceof ValidationError && error.details && typeof error.details === 'object') {
        setErrors((current) => ({ ...current, ...error.details }))
      } else if (error instanceof ApiError) {
        setMessage(error.message)
      } else {
        setMessage('Something went wrong. Please try again.')
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthModal onClose={onClose} variant="signin">
      <div className="flex flex-col items-center px-[clamp(24px,8vw,58px)] pt-[38px] pb-[35px] max-[680px]:px-[22px] max-[680px]:pt-8 max-[680px]:pb-[27px]">
        <BrandMark className="size-[86px] max-[680px]:size-[72px]" />
        <h2 className="my-[25px] mb-[27px] text-center text-[clamp(1.35rem,4vw,1.75rem)] font-normal text-[#f0efed]" id="signin-title">
          Create your account
        </h2>
        <form className="flex w-full flex-col gap-[14px]" noValidate onSubmit={handleSubmit}>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="signin-name">
              Full name
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <input
                aria-describedby={errors.name ? 'signin-name-error' : undefined}
                aria-invalid={errors.name ? 'true' : undefined}
                autoComplete="name"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="signin-name"
                name="name"
                placeholder="Your full name"
                required
                type="text"
              />
            </div>
            {errors.name && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="signin-name-error" role="alert">
                {errors.name}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="signin-email">
              Email address
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="1.5" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                aria-describedby={errors.email ? 'signin-email-error' : undefined}
                aria-invalid={errors.email ? 'true' : undefined}
                autoComplete="email"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="signin-email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
            {errors.email && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="signin-email-error" role="alert">
                {errors.email}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="signin-phone">
              Mobile number
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="3" width="12" height="18" rx="2" />
                <path d="M11 18h2" />
              </svg>
              <input
                aria-describedby={errors.phone ? 'signin-phone-error' : undefined}
                aria-invalid={errors.phone ? 'true' : undefined}
                autoComplete="tel"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="signin-phone"
                name="phone"
                placeholder="09XX XXX XXXX"
                required
                type="tel"
              />
            </div>
            {errors.phone && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="signin-phone-error" role="alert">
                {errors.phone}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="signin-password">
              Password
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
              </svg>
              <input
                aria-describedby={errors.password ? 'signin-password-error' : undefined}
                aria-invalid={errors.password ? 'true' : undefined}
                autoComplete="new-password"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="signin-password"
                name="password"
                placeholder="Create your password"
                required
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="grid h-[34px] w-7 shrink-0 cursor-pointer place-items-center border-0 bg-transparent text-[#b1b1b1]"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                <svg className="w-[23px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            {errors.password && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="signin-password-error" role="alert">
                {errors.password}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="signin-confirm">
              Confirm password
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
              </svg>
              <input
                aria-describedby={errors.confirmPassword ? 'signin-confirm-error' : undefined}
                aria-invalid={errors.confirmPassword ? 'true' : undefined}
                autoComplete="new-password"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="signin-confirm"
                name="confirmPassword"
                placeholder="Re-enter your password"
                required
                type={showConfirmPassword ? 'text' : 'password'}
              />
              <button
                aria-label={
                  showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'
                }
                className="grid h-[34px] w-7 shrink-0 cursor-pointer place-items-center border-0 bg-transparent text-[#b1b1b1]"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                type="button"
              >
                <svg className="w-[23px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="signin-confirm-error" role="alert">
                {errors.confirmPassword}
              </p>
            )}
          </div>
          <button
            className="btn-pill mt-1 inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[0.7rem] font-bold tracking-[0.13em] text-[#111] uppercase hover:bg-[var(--gold-bright)] disabled:cursor-default disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            SIGN UP
          </button>
        </form>
        {message && <p className="auth-note mt-[13px] text-center text-[0.68rem] leading-[1.5]" role="status">{message}</p>}
        <p className="mt-[19px] text-center text-[0.68rem] text-[#aaa7a0]">
          Already have an account?{' '}
          <button className="auth-link cursor-pointer border-0 bg-transparent p-0 no-underline hover:underline" onClick={onSwitch} type="button">
            Log in
          </button>
        </p>
        <div className="relative my-[21px] w-full text-center text-[0.58rem] text-[#77736b] before:absolute before:top-1/2 before:right-0 before:left-0 before:h-px before:bg-[#34322e] before:content-['']">
          <span className="relative bg-[#11110f] px-3">OR</span>
        </div>
        <button
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-[10px] rounded border border-[#34322e] bg-[#171716] text-[0.7rem] text-[#e1ded8] transition-[border-color,background] duration-[180ms] hover:border-[var(--gold)] hover:bg-[#1d1c19]"
          onClick={() => setMessage('Sign-up isn’t available yet.')}
          type="button"
        >
          <span className="font-[Arial,sans-serif] text-base font-bold text-[#4285f4]" aria-hidden="true">G</span>
          Sign up with Google
        </button>
      </div>
    </AuthModal>
  )
}

export default Signin
