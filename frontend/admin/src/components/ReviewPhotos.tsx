import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useDialogBehavior } from './useDialogBehavior';
import { photoAltText, sortPhotos, type ReviewPhoto } from '../reviewPhotos';

/**
 * The photo strip of one review in the admin reviews widget.
 *
 * Thumbnails keep a fixed 4:3 crop (object-fit: cover) and load lazily, so a
 * review with several photos never blocks the dashboard. Each thumbnail is a
 * button that opens the keyboard lightbox below; staff who may moderate see a
 * hide/unhide control under every photo.
 */
export function ReviewPhotos({
  reviewId,
  reviewerName,
  photos,
  canManage,
  onTogglePhotoHidden,
}: {
  reviewId: string;
  reviewerName: string;
  photos: ReviewPhoto[];
  canManage: boolean;
  /** PATCH the photo's hidden state; resolves true when the API confirmed it. */
  onTogglePhotoHidden: (reviewId: string, photo: ReviewPhoto, hidden: boolean) => Promise<boolean>;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ordered = sortPhotos(photos);

  if (ordered.length === 0) return null;

  async function toggleHidden(photo: ReviewPhoto, hidden: boolean) {
    setPendingId(photo.id);
    try {
      await onTogglePhotoHidden(reviewId, photo, hidden);
    } finally {
      setPendingId((current) => (current === photo.id ? null : current));
    }
  }

  return (
    <div className="review-photos">
      <ul className="review-photo-grid">
        {ordered.map((photo, index) => {
          const alt = photoAltText(index + 1, ordered.length, reviewerName);
          return (
            <li key={photo.id} className="review-photo-cell">
              <button
                type="button"
                className="review-photo-thumb"
                onClick={() => setLightboxIndex(index)}
              >
                <img src={photo.url} alt={alt} loading="lazy" />
              </button>
              {canManage && (
                <button
                  type="button"
                  className="review-photo-hide"
                  aria-label={`${photo.hidden ? 'Unhide' : 'Hide'} photo ${index + 1} of ${ordered.length}`}
                  disabled={pendingId === photo.id}
                  onClick={() => toggleHidden(photo, !photo.hidden)}
                >
                  {pendingId === photo.id ? 'Saving…' : photo.hidden ? 'Unhide' : 'Hide'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {lightboxIndex !== null && ordered[lightboxIndex] && (
        <ReviewPhotoLightbox
          photos={ordered}
          index={lightboxIndex}
          reviewerName={reviewerName}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * The photo lightbox: one large photo of a review at a time.
 *
 * `useDialogBehavior` moves focus inside on open, traps Tab within, closes on
 * Escape and returns focus to the thumbnail that opened it. The arrow keys
 * step through the same review's photos; they never leave the review.
 */
function ReviewPhotoLightbox({
  photos,
  index,
  reviewerName,
  onIndexChange,
  onClose,
}: {
  photos: ReviewPhoto[];
  index: number;
  reviewerName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialogBehavior<HTMLDivElement>(onClose);
  const total = photos.length;
  const photo = photos[index]!;
  const alt = photoAltText(index + 1, total, reviewerName);

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onIndexChange((index - 1 + total) % total);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onIndexChange((index + 1) % total);
    }
  }

  return (
    <div
      className="modal-overlay photo-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onKeyDown={onKeyDown}
    >
      <section ref={dialogRef} className="modal-card photo-lightbox">
        <div className="modal-header">
          <h3 id="photo-lightbox-title">{alt}</h3>
          <button type="button" className="lightbox-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="lightbox-stage">
          <img src={photo.url} alt={alt} className="lightbox-image" />
        </div>
        <div className="lightbox-controls">
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + total) % total)}
            disabled={total < 2}
          >
            Previous
          </button>
          <span className="lightbox-count">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % total)}
            disabled={total < 2}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
