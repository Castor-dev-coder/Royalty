import { useRef, useState } from 'react'
import AuthModal from './AuthModal.jsx'
import BrandMark from './BrandMark.jsx'
import GoogleSignInButton from './GoogleSignInButton.jsx'
import { useAuth } from '../context/useAuth.jsx'
import { ApiError, AuthError, ValidationError } from '../lib/api.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Login({ onClose, onSwitch, onLogin = () => {} }) {
  const { signIn } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const formRef = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()
    // Guards duplicate submissions even before React re-renders.
    if (submittingRef.current) return

    const form = event.currentTarget
    const email = String(form.elements.email.value).trim()
    const password = String(form.elements.password.value)
    const nextErrors = {}
    if (!email) {
      nextErrors.email = 'Enter your email address.'
    } else if (!EMAIL_PATTERN.test(email)) {
      nextErrors.email = 'Enter a valid email address, such as you@example.com.'
    }
    if (!password) {
      nextErrors.password = 'Enter your password.'
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
    const rememberMe = Boolean(form.elements.rememberMe?.checked)
    try {
      const user = await signIn(email, password, rememberMe)
      onLogin(user)
      onClose()
    } catch (error) {
      if (error instanceof ValidationError && error.details && typeof error.details === 'object') {
        setErrors((current) => ({ ...current, ...error.details }))
      } else if (error instanceof AuthError) {
        setMessage('Email or password is incorrect.')
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
    <AuthModal onClose={onClose} variant="login">
      <div className="flex flex-col items-center px-[clamp(24px,8vw,58px)] pt-[38px] pb-[35px] max-[680px]:px-[22px] max-[680px]:pt-8 max-[680px]:pb-[27px]">
        <BrandMark className="size-[86px] max-[680px]:size-[72px]" />
        <h2 className="my-[25px] mb-[27px] text-center text-[clamp(1.35rem,4vw,1.75rem)] font-normal text-[#f0efed]" id="login-title">
          Login to your account
        </h2>
        <form className="flex w-full flex-col gap-[14px]" noValidate onSubmit={handleSubmit} ref={formRef}>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="login-email">
              Email address
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="1.5" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                aria-invalid={errors.email ? 'true' : undefined}
                autoComplete="email"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="login-email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
            {errors.email && (
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="login-email-error" role="alert">
                {errors.email}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-[7px]">
            <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="login-password">
              Password
            </label>
            <div className="flex min-h-[61px] items-center gap-[19px] rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[18px] transition-[border-color,box-shadow] duration-[180ms] focus-within:border-[var(--gold)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.1)] max-[680px]:min-h-[55px] max-[680px]:gap-[13px] max-[680px]:px-[14px]">
              <svg className="size-[26px] shrink-0 fill-none stroke-[var(--gold)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
              </svg>
              <input
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                aria-invalid={errors.password ? 'true' : undefined}
                autoComplete="current-password"
                className="min-w-0 w-full border-0 bg-transparent text-[0.88rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus-visible:outline-0 max-[680px]:text-[0.78rem]"
                id="login-password"
                name="password"
                placeholder="Enter your password"
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
              <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="login-password-error" role="alert">
                {errors.password}
              </p>
            )}
          </div>
          <div className="-mt-[5px] flex justify-end">
            <button
              className="auth-link cursor-pointer border-0 bg-transparent p-0 text-[0.65rem] no-underline hover:underline"
              onClick={() =>
                setMessage('Password recovery will be available when auth is connected.')
              }
              type="button"
            >
              Forgot password?
            </button>
          </div>
          <label className="-mt-[2px] flex cursor-pointer items-center gap-[8px] text-[0.72rem] text-[#b3ada2]">
            <input
              className="size-[15px] cursor-pointer accent-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
              name="rememberMe"
              type="checkbox"
            />
            Keep me logged in
          </label>
          <button
            className="btn-pill mt-1 inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[0.7rem] font-bold tracking-[0.13em] text-[#111] uppercase hover:bg-[var(--gold-bright)] disabled:cursor-default disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            LOG IN
          </button>
        </form>
        {message && <p className="auth-note mt-[13px] text-center text-[0.68rem] leading-[1.5]" role="status">{message}</p>}
        <p className="mt-[19px] text-center text-[0.68rem] text-[#aaa7a0]">
          Don&apos;t have an account?{' '}
          <button className="auth-link cursor-pointer border-0 bg-transparent p-0 no-underline hover:underline" onClick={onSwitch} type="button">
            Sign up
          </button>
        </p>
        <GoogleSignInButton
          onSignedIn={(nextUser) => {
            onLogin(nextUser)
            onClose()
          }}
        />
      </div>
    </AuthModal>
  )
}

export default Login
