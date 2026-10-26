import { useState } from 'react';
import { useDialogBehavior } from './useDialogBehavior';
import { CustomerAvatar } from './CustomerAvatar';
import { formatDate, formatMoney } from '../shared/ui';
import {
  channelBadge,
  channelLabel,
  methodLabel,
  paymentHistoryFor,
  paymentStatusBadge,
  paymentStatusLabel,
  proofAltText,
  type PaymentRow,
} from '../payments';

/**
 * One payment, in full: the money the server reports for the booking, the
 * transaction history behind it, and the proof image when there is one.
 *
 * The verify and reject controls appear only for an unverified payment and
 * only for a session the API allows to review; every figure shown here is a
 * server field, never arithmetic done in this browser.
 */
export function PaymentDetailModal({
  payment,
  payments,
  canReview,
  onClose,
  onVerify,
  onReject,
}: {
  payment: PaymentRow;
  /** The full payment list, used to show this appointment's history. */
  payments: PaymentRow[];
  canReview: boolean;
  onClose: () => void;
  onVerify: () => void;
  onReject: () => void;
}) {
  const [proofOpen, setProofOpen] = useState(false);
  // The lightbox is the top dialog while it is open, so this dialog steps
  // aside: one focus trap and one Escape handler at a time.
  const dialogRef = useDialogBehavior<HTMLElement>(onClose, !proofOpen);
  const history = paymentHistoryFor(payments, payment.appointmentId);

  return (
    <>
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-detail-title" onClick={onClose}>
      <section ref={dialogRef} className="modal-card payment-modal payment-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="payment-detail-title">Payment {payment.appointmentCode}</h3>
          <button type="button" className="close-button" aria-label="Close payment details" onClick={onClose}>×</button>
        </div>
        <div className="payment-detail-badges">
          <span className={`status-badge ${channelBadge(payment.channel)}`}>{channelLabel(payment.channel)}</span>
          <span className="status-badge neutral">{methodLabel(payment.paymentMethod)}</span>
          <span className={`status-badge ${paymentStatusBadge(payment.status)}`}>{paymentStatusLabel(payment.status)}</span>
        </div>
        <dl className="payment-details">
          <div><dt>Customer</dt><dd><span className="person-inline"><CustomerAvatar name={payment.customerName} /><span>{payment.customerName}</span></span></dd></div>
          <div><dt>Service</dt><dd>{payment.serviceName}</dd></div>
          <div><dt>Amount</dt><dd>{formatMoney(payment.amount)}</dd></div>
          <div><dt>Method</dt><dd>{methodLabel(payment.paymentMethod)}</dd></div>
          <div><dt>Channel</dt><dd>{channelLabel(payment.channel)}</dd></div>
          <div><dt>Reference number</dt><dd>{payment.referenceNo || '—'}</dd></div>
          <div><dt>Recorded by</dt><dd>{payment.recordedBy || '—'}</dd></div>
          {payment.verifiedAt && <div><dt>Verified</dt><dd>{formatDate(payment.verifiedAt)}{payment.verifiedBy ? ` · ${payment.verifiedBy}` : ''}</dd></div>}
        </dl>

        <div className="payment-totals" aria-label="Appointment balances">
          <div><span>Appointment total</span><strong>{formatMoney(payment.appointmentTotal)}</strong></div>
          <div><span>Total verified received</span><strong>{formatMoney(payment.verifiedTotal)}</strong></div>
          <div><span>Outstanding</span><strong>{formatMoney(payment.outstanding)}</strong></div>
        </div>

        <div className="payment-proof">
          <h4>Payment proof</h4>
          {payment.proofUrl ? (
            <button type="button" className="payment-proof-thumb" onClick={() => setProofOpen(true)}>
              <img src={payment.proofUrl} alt={proofAltText(payment.appointmentCode)} loading="lazy" />
            </button>
          ) : (
            <p className="empty-list">No proof image. Payments received in person as cash carry no uploaded proof.</p>
          )}
        </div>

        <div className="payment-history">
          <h4>Transaction history</h4>
          <ul className="payment-history-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <span className={`status-badge ${channelBadge(entry.channel)}`}>{channelLabel(entry.channel)}</span>
                <span className="payment-history-method">{methodLabel(entry.paymentMethod)}</span>
                <strong>{formatMoney(entry.amount)}</strong>
                <span className={`status-badge ${paymentStatusBadge(entry.status)}`}>{paymentStatusLabel(entry.status)}</span>
                <small>{entry.createdAt ? formatDate(entry.createdAt) : '—'}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Close</button>
          {payment.status === 'UNVERIFIED' && (
            canReview ? (
              <>
                <button type="button" className="reject-action" onClick={onReject}>Reject</button>
                <button type="button" className="primary-action" onClick={onVerify}>Verify</button>
              </>
            ) : (
              <p className="payment-hint">Only administrators and managers can verify payments.</p>
            )
          )}
        </div>
      </section>
    </div>
      {proofOpen && payment.proofUrl && (
        <PaymentProofLightbox url={payment.proofUrl} alt={proofAltText(payment.appointmentCode)} onClose={() => setProofOpen(false)} />
      )}
    </>
  );
}

/**
 * The payment proof lightbox: one large proof image.
 *
 * It follows the review photo lightbox exactly: `useDialogBehavior` moves
 * focus inside, traps Tab, closes on Escape and returns focus to the
 * thumbnail that opened it.
 */
function PaymentProofLightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const dialogRef = useDialogBehavior<HTMLDivElement>(onClose);
  return (
    <div className="modal-overlay photo-lightbox-overlay" role="dialog" aria-modal="true" aria-label={alt}>
      <section ref={dialogRef} className="modal-card photo-lightbox">
        <div className="modal-header">
          <h3 id="payment-proof-lightbox-title">{alt}</h3>
          <button type="button" className="lightbox-close" onClick={onClose}>Close</button>
        </div>
        <div className="lightbox-stage">
          <img src={url} alt={alt} className="lightbox-image" />
        </div>
      </section>
    </div>
  );
}
