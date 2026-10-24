import { Component } from 'react'

// Catches render errors anywhere below it. The root boundary guards the whole
// app; the per-route boundary in AppShell (keyed by pathname) keeps one broken
// route from taking down the shell. Stack traces are never rendered.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Dev console only — nothing from `info` or `error.stack` is ever shown.
    if (import.meta.env.DEV) {
      console.error('Render error caught by boundary:', error, info)
    }
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  handleHome = () => {
    window.location.assign('/')
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-black px-6 py-16 text-center text-[#eeeae2]">
        <p className="m-0 font-[var(--serif)] text-[clamp(2.5rem,8vw,4.5rem)] leading-none text-[var(--gold)]">
          Something went wrong.
        </p>
        <p className="m-0 max-w-[46ch] text-[15px] leading-relaxed text-[#b3ada2]">
          This page hit an unexpected error. You can try again or head back to the home page.
        </p>
        {import.meta.env.DEV && (
          <pre className="m-0 max-w-[70ch] overflow-x-auto rounded-lg border border-[#3a352c] bg-[#151515] px-4 py-3 text-left text-[12px] text-[#e9a68c]">
            {String(error?.message ?? error)}
          </pre>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            className="btn-pill min-h-[44px] cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-7 text-[13px] font-bold tracking-[0.12em] text-[#111] uppercase hover:bg-[var(--gold-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            onClick={this.handleRetry}
            type="button"
          >
            Try again
          </button>
          <button
            className="btn-pill min-h-[44px] cursor-pointer rounded-full border border-[#635b4c] px-7 text-[13px] font-semibold text-[#d5cdbf] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
            onClick={this.handleHome}
            type="button"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
