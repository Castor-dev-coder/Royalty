import { useEffect, useState } from 'react'

function BookingFlow({ service, user, onClose }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', date: '', time: '', notes: '', payment: 'GCASH' })
  const [error, setError] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
  }

  function continueToPayment(event) {
    event.preventDefault()
    if (!form.name || !form.email || !form.date || !form.time) {
      setError('Please complete the required fields before continuing.')
      return
    }
    setStep(2)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <section onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[6px] border border-[var(--gold)] bg-[#11110f] shadow-[0_20px_80px_rgba(0,0,0,.65)]">
        <div className="flex items-center justify-between border-b border-[rgba(212,180,92,.25)] px-6 py-5">
          <div><p className="m-0 text-[10px] uppercase tracking-[2px] text-[var(--gold)]">Royalty Salon</p><h2 id="booking-title" className="m-1 font-[var(--serif)] text-2xl text-[#f3eee5]">{step === 3 ? 'Booking Confirmed' : step === 2 ? 'Proceed to Payment' : 'Book your appointment'}</h2></div>
          <button type="button" onClick={onClose} className="text-2xl text-[#aaa49a] hover:text-[var(--gold)]" aria-label="Close">×</button>
        </div>
        {step === 3 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full border border-[var(--gold)] text-3xl text-[var(--gold)]">✓</div>
            <h3 className="mt-5 font-[var(--serif)] text-2xl text-[var(--gold)]">Thank you, {form.name}!</h3>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#bbb6ad]">Your appointment has been successfully booked. We look forward to pampering you!</p>
            <button type="button" onClick={onClose} className="mt-7 rounded border border-[var(--gold)] bg-[var(--gold)] px-7 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Done</button>
          </div>
        ) : (
          <div className="px-6 py-6">
            <div className="mb-6 flex items-center gap-3 rounded border border-[rgba(212,180,92,.35)] bg-[#181612] p-3"><img className="size-14 rounded object-cover" src={service.image} alt="" /><div><p className="m-0 font-[var(--serif)] text-lg text-[#f3eee5]">{service.title}</p><p className="m-0 mt-1 text-xs text-[var(--gold)]">{service.duration} · {service.price}</p></div></div>
            {step === 1 ? <form className="grid gap-4" onSubmit={continueToPayment}>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Full name<input required value={form.name} onChange={(e) => update('name', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--gold)]" /></label>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Email address<input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--gold)]" /></label>
              <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Date<input required type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-[var(--gold)]" /></label><label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Time<select required value={form.time} onChange={(e) => update('time', e.target.value)} className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm text-white outline-none focus:border-[var(--gold)]"><option value="">Select</option><option>10:00 AM</option><option>1:00 PM</option><option>2:30 PM</option><option>4:00 PM</option></select></label></div>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Special requests (optional)<textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows="3" className="rounded border border-[#3a3835] bg-[#1c1b18] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--gold)]" /></label>
              {error && <p className="m-0 text-xs text-[#e9a68c]" role="alert">{error}</p>}<button className="mt-2 rounded border border-[var(--gold)] bg-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#111]">Proceed to Payment</button>
            </form> : <div className="grid gap-5"><div className="rounded border border-[rgba(212,180,92,.25)] p-4 text-sm leading-7 text-[#cbc5ba]"><p className="m-0 text-xs uppercase tracking-wider text-[var(--gold)]">Appointment summary</p><p className="m-0 mt-2">{form.date} at {form.time}</p><p className="m-0">Total: <strong className="text-[var(--gold)]">{service.price}</strong></p></div><fieldset className="grid gap-3"><legend className="mb-1 text-xs uppercase tracking-wider text-[#bcb5a9]">Choose payment method</legend>{['GCASH', 'CASH'].map((method) => <label key={method} className="flex cursor-pointer items-center gap-3 rounded border border-[#3a3835] p-4 text-sm text-[#eee] has-[:checked]:border-[var(--gold)]"><input type="radio" name="payment" value={method} checked={form.payment === method} onChange={(e) => update('payment', e.target.value)} />{method === 'GCASH' ? 'GCash' : 'Pay at the salon'}</label>)}</fieldset><div className="flex gap-3"><button type="button" onClick={() => setStep(1)} className="flex-1 rounded border border-[#635b4c] px-5 py-3 text-xs font-bold uppercase text-[#d5cdbf]">Back</button><button type="button" onClick={() => setStep(3)} className="flex-1 rounded border border-[var(--gold)] bg-[var(--gold)] px-5 py-3 text-xs font-bold uppercase text-[#111]">Confirm Payment</button></div></div>}
          </div>
        )}
      </section>
    </div>
  )
}

export default BookingFlow