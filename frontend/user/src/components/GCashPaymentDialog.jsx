import { useEffect, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import { ApiError, fetchPaymentQuote, submitOnlinePayment } from '../lib/api.js'
import { makePreviewUrl, validatePhotoFile } from '../lib/reviewPhotos.js'
import {
  optionLabel,
  paymentFailureMessage,
  quoteSummaryRows,
  quoteViewState,
  salonOptionMessage,
  validateReferenceNo,
} from '../lib/payments.js'
import { useToast } from '../context/useToast.jsx'

// GCash payment dialog for one appointment. Every amount is the SERVER's
// (quote options, totals, balances) — nothing money-shaped is computed here.
// Flow: quote -> option -> reference number + proof image -> submit -> the
// payment lands as Awaiting verification. Failures keep the dialog state and
// show the server message with a retry; 'Pay at the salon' only informs and
// closes (no online collection).
function GCashPaymentDialog({ item, onClose, onSubmitted, preselectedOption = null }) {
  const { showToast } = useToast()
  const [quote, setQuote] = useState(null)
  const [quoteStatus, setQuoteStatus] = useState('loading') // loading | ready | error
  const [quoteError, setQuoteError] = useState('')
  const [reloadTick, setReloadTick] = useState(0)

  const [referenceNo, setReferenceNo] = useState('')
  const [referenceError, setReferenceError] = useState(null)
  const [proof, setProof] = useState(null) // in-memory draft only
  // A plan chosen in the booking flow arrives preselected ('FULL' | 'DOWN').
  const [optionKey, setOptionKey] = useState(preselectedOption ?? '')
  const [proofError, setProofError] = useState(null)
  const [qrFailed, setQrFailed] = useState(false)

  const [submitStatus, setSubmitStatus] = useState('idle') // idle | submitting | done
  const [submitError, setSubmitError] = useState('')
  const submitRef = useRef(false)
  const proofRef = useRef(null)

  // Server quote for this appointment. The synchronous body only starts the
  // fetch — every setState lives in the promise callbacks.
  useEffect(() => {
    let cancelled = false
    fetchPaymentQuote(item.id).then(
      (result) => {
        if (cancelled) return
        setQuote(result?.quote ?? result ?? null)
        setQuoteStatus('ready')
      },
      (error) => {
        if (cancelled) return
        setQuoteError(error instanceof ApiError ? error.message : 'Could not load payment details.')
        setQuoteStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [item.id, reloadTick])

  // The proof preview URL is memory-only and released on unmount.
  useEffect(() => {
    return () => {
      if (proofRef.current?.previewUrl) URL.revokeObjectURL(proofRef.current.previewUrl)
    }
  }, [])

  const view = quoteViewState(quote)
  const settings = quote?.settings ?? null

  async function handleProof(fileList) {
    const file = fileList?.[0]
    if (!file) return
    const result = await validatePhotoFile(file)
    if (!result.ok) {
      setProofError(result.error)
      return
    }
    if (proofRef.current?.previewUrl) URL.revokeObjectURL(proofRef.current.previewUrl)
    const next = { file, mime: result.mime, previewUrl: makePreviewUrl(file), progress: 0 }
    proofRef.current = next
    setProof(next)
    setProofError(null)
  }

  function removeProof() {
    if (proofRef.current?.previewUrl) URL.revokeObjectURL(proofRef.current.previewUrl)
    proofRef.current = null
    setProof(null)
  }

  function handleRetryQuote() {
    setQuoteError('')
    setQuoteStatus('loading')
    setReloadTick((tick) => tick + 1)
  }

  function handlePayAtSalon() {
    showToast('info', salonOptionMessage(quote))
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitRef.current || submitStatus === 'done') return

    const nextReferenceError = validateReferenceNo(referenceNo)
    const nextOptionError = optionKey ? null : 'Choose how much you want to pay.'
    const nextProofError = proof ? null : 'Add your payment proof (PNG or JPG screenshot).'
    setReferenceError(nextReferenceError)
    setProofError(nextProofError)
    if (nextReferenceError || nextOptionError || !proof) {
      setSubmitError(nextOptionError ?? '')
      return
    }

    submitRef.current = true
    setSubmitStatus('submitting')
    setSubmitError('')
    try {
      await submitOnlinePayment(item.id, {
        option: optionKey,
        referenceNo: referenceNo.trim(),
        file: proof.file,
        contentType: proof.mime,
        onProgress: (percent) => setProof((current) => (current ? { ...current, progress: percent } : current)),
      })
      setSubmitStatus('done')
      onSubmitted?.()
    } catch (error) {
      // Keep everything the customer entered; the server message is shown
      // verbatim and the submit button doubles as the retry.
      setSubmitStatus('idle')
      setSubmitError(paymentFailureMessage(error))
    } finally {
      submitRef.current = false
    }
  }

  return (
    <Dialog labelledBy="gcash-payment-title" onClose={onClose}>
      <div className="flex flex-col gap-5 px-6 py-6 max-[680px]:px-4 max-[680px]:py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 font-[var(--serif)] text-[22px] leading-snug text-[#eeeae2]" id="gcash-payment-title">
              Pay with GCash
            </h2>
            <p className="m-0 mt-1 text-[12px] tracking-[0.14em] text-[#8d877c] uppercase">{item.appointmentCode}</p>
          </div>
          <button
            aria-label="Close payment dialog"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-[#3a3835] bg-transparent text-[16px] leading-none text-[#c9c5bb] hover:border-[var(--gold)] hover:text-[var(--gold)]"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {quoteStatus === 'loading' && (
          <p className="m-0 text-[14px] text-[#b3ada2]" role="status">
            Loading payment details…
          </p>
        )}

        {quoteStatus === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[14px] text-[#e9a68c]" role="alert">
              {quoteError}
            </p>
            <button
              className="cursor-pointer rounded-full border border-[#635b4c] px-6 py-2.5 text-[12px] font-semibold tracking-[0.12em] text-[#d5cdbf] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2]"
              onClick={handleRetryQuote}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {quoteStatus === 'ready' && view === 'unconfigured' && (
          <div className="flex flex-col items-start gap-4">
            <p className="m-0 text-[15px] text-[#d8d4cb]" role="status">
              Online GCash payments are not configured yet.
            </p>
            <button
              className="cursor-pointer rounded-full border border-[#3a352c] px-5 py-2.5 text-[12px] font-semibold tracking-[0.12em] text-[#b3ada2] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2]"
              onClick={handlePayAtSalon}
              type="button"
            >
              Pay at the salon
            </button>
          </div>
        )}

        {quoteStatus === 'ready' && view === 'fully-paid' && (
          <p className="m-0 text-[15px] text-[#d8d4cb]" role="status">
            This appointment is fully paid.
          </p>
        )}

        {quoteStatus === 'ready' && view === 'ready' && submitStatus !== 'done' && (
          <>
            <dl className="m-0 flex flex-col gap-2 rounded-lg border border-[#27241f] bg-[#151515] px-4 py-4">
              {quoteSummaryRows(quote).map((row) => (
                <div className="flex items-baseline justify-between gap-4" key={row.key}>
                  <dt className="m-0 text-[12px] tracking-[0.14em] text-[#8d877c] uppercase">{row.label}</dt>
                  <dd className={`m-0 tabular-nums ${row.key === 'outstanding' ? 'text-[18px] font-semibold text-[var(--gold)]' : 'text-[15px] text-[#d8d4cb]'}`}>
                    {row.display}
                  </dd>
                </div>
              ))}
            </dl>

            {settings?.gcashQrUrl && !qrFailed ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-[#27241f] bg-[#151515] px-4 py-4">
                <img
                  alt="GCash QR code"
                  className="block size-[220px] max-w-full rounded-md border border-[#3a3835] bg-white object-contain"
                  loading="lazy"
                  onError={() => setQrFailed(true)}
                  src={settings.gcashQrUrl}
                />
                <div className="text-center">
                  {settings.receiverName && <p className="m-0 text-[13px] text-[#d8d4cb]">{settings.receiverName}</p>}
                  {settings.accountNumberMasked && (
                    <p className="m-0 mt-1 text-[12px] tracking-[0.08em] text-[#8d877c]">{settings.accountNumberMasked}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[#8d877c]" role="status">
                The GCash QR code is unavailable right now.
              </p>
            )}

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">Payment option</legend>
              {quote.options.map((option) => (
                <button
                  aria-pressed={optionKey === option.key}
                  className={`btn-pill min-h-[44px] w-full cursor-pointer rounded-full border px-5 text-[12px] font-semibold tracking-[0.12em] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
                    optionKey === option.key
                      ? 'border-[var(--gold)] bg-[var(--gold)] text-[#111]'
                      : 'border-[#3a352c] text-[#d8d4cb] hover:border-[var(--gold)] hover:text-[#eeeae2]'
                  }`}
                  key={option.key}
                  onClick={() => {
                    setOptionKey(option.key)
                    setSubmitError('')
                  }}
                  type="button"
                >
                  {optionLabel(option, settings)}
                </button>
              ))}
              <button
                className="min-h-[44px] w-full cursor-pointer rounded-full border border-[#3a352c] bg-transparent px-5 text-[12px] font-semibold tracking-[0.12em] text-[#b3ada2] uppercase hover:border-[var(--gold)] hover:text-[#eeeae2]"
                onClick={handlePayAtSalon}
                type="button"
              >
                Pay at the salon
              </button>
            </fieldset>

            <form className="flex flex-col gap-[14px]" noValidate onSubmit={handleSubmit}>
              <div className="flex w-full flex-col gap-[7px]">
                <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="gcash-reference">
                  GCash reference number
                </label>
                <input
                  aria-describedby={referenceError ? 'gcash-reference-error' : undefined}
                  aria-invalid={referenceError ? 'true' : undefined}
                  autoComplete="off"
                  className="min-h-[46px] w-full rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[14px] text-[0.82rem] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus:border-[var(--gold)]"
                  id="gcash-reference"
                  minLength={3}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="e.g. 0123456789"
                  required
                  type="text"
                  value={referenceNo}
                />
                {referenceError && (
                  <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" id="gcash-reference-error" role="alert">
                    {referenceError}
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-[7px]">
                <span className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">Proof of payment</span>
                <p className="m-0 text-[0.68rem] leading-[1.5] text-[#898783]">PNG or JPG screenshot, 10 MB max.</p>
                {proof ? (
                  <div className="flex items-start gap-3">
                    <div className="relative w-[112px]">
                      <div className="overflow-hidden rounded-[8px] border border-[#3a3835]">
                        <img alt="Payment proof preview" className="block aspect-[4/3] w-full object-cover" draggable={false} src={proof.previewUrl} />
                      </div>
                      <button
                        aria-label="Remove payment proof"
                        className="absolute top-[5px] right-[5px] grid size-6 cursor-pointer place-items-center rounded-full border border-[#3a3835] bg-black/75 text-[13px] leading-none text-[#c9c5bb] hover:border-[#e9a68c] hover:text-[#e9a68c]"
                        onClick={removeProof}
                        type="button"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                      {submitStatus === 'submitting' && (
                        <>
                          <div
                            aria-label="Upload progress for payment proof"
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={proof.progress}
                            className="mt-[6px] h-[3px] w-full overflow-hidden rounded-full bg-[#2a2825]"
                            role="progressbar"
                          >
                            <div className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-200" style={{ width: `${proof.progress}%` }} />
                          </div>
                          <p className="m-0 mt-[4px] text-[0.62rem] text-[#aaa7a0]">Uploading… {proof.progress}%</p>
                        </>
                      )}
                    </div>
                    <button
                      className="cursor-pointer rounded-full border border-[#3a3835] bg-transparent px-[1.1rem] py-[0.6rem] text-[0.66rem] font-semibold tracking-[0.12em] text-[#c9c5bb] uppercase hover:border-[var(--gold)] hover:text-[#f0efed]"
                      onClick={removeProof}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      accept="image/png,image/jpeg"
                      aria-label="Add payment proof"
                      className="sr-only"
                      id="gcash-proof-input"
                      onChange={(event) => {
                        void handleProof(event.target.files)
                        event.target.value = ''
                      }}
                      type="file"
                    />
                    <label
                      className="inline-flex w-fit cursor-pointer items-center rounded-full border border-[#3a3835] bg-transparent px-[1.1rem] py-[0.6rem] text-[0.66rem] font-semibold tracking-[0.12em] text-[#c9c5bb] uppercase hover:border-[var(--gold)] hover:text-[#f0efed]"
                      htmlFor="gcash-proof-input"
                    >
                      + Add screenshot
                    </label>
                  </>
                )}
                {proofError && (
                  <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" role="alert">
                    {proofError}
                  </p>
                )}
              </div>

              {submitError && (
                <p className="m-0 text-[0.72rem] leading-[1.5] text-[#e9a68c]" role="alert">
                  {submitError}
                </p>
              )}

              <button
                className="btn-pill inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.4rem] py-[0.8rem] text-[0.7rem] font-bold tracking-[0.13em] text-[#111] uppercase hover:bg-[var(--gold-bright)] disabled:cursor-default disabled:opacity-60"
                disabled={submitStatus === 'submitting'}
                type="submit"
              >
                {submitStatus === 'submitting' ? 'SUBMITTING…' : 'SUBMIT PAYMENT'}
              </button>
            </form>
          </>
        )}

        {quoteStatus === 'ready' && submitStatus === 'done' && (
          <div className="flex flex-col items-start gap-4">
            <p className="m-0 text-[15px] text-[#d8d4cb]" role="status">
              Your payment was submitted.{' '}
              <strong className="font-semibold tracking-[0.12em] text-[var(--gold)] uppercase">Awaiting verification</strong>
            </p>
            <button
              className="btn-pill cursor-pointer rounded-full border border-[var(--gold)] bg-[var(--gold)] px-7 py-3 text-[13px] font-bold text-black hover:bg-[var(--gold-bright)]"
              onClick={onClose}
              type="button"
            >
              CLOSE
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export default GCashPaymentDialog
