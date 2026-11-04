/**
 * Review photo data and pure helpers for the admin reviews widget.
 *
 * The photo payload a review carries is shaped by the API: `position` orders
 * the photos within one review and `url` is the uploaded file. Everything
 * here is pure so the naming, alt text and list bookkeeping can be unit
 * tested without a DOM.
 */

export type ReviewPhoto = {
  id: string;
  position: number;
  url: string;
  /** The moderation state as last confirmed by the API. Reads only ever
   *  include visible photos, so this is false unless a write just said so. */
  hidden?: boolean;
};

/** Photos in the order the review presents them, without mutating the input. */
export function sortPhotos(photos: ReviewPhoto[]): ReviewPhoto[] {
  return [...photos].sort((a, b) => a.position - b.position);
}

/**
 * The customer's initials as they appear in photo alt text: first and last
 * name's first letters, one letter for a single name, empty when there is no
 * name at all (the caller then falls back to "a customer").
 */
export function photoInitials(name: string): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Alt text for one photo of a review: `Photo N of M from MS's review`.
 *
 * `n` is the 1-based position in the review's photo list and `total` is the
 * review's photo count. Without a reviewer name the sentence falls back to
 * `Photo N of M from a customer's review`.
 */
export function photoAltText(n: number, total: number, reviewerName: string): string {
  const where = `Photo ${n} of ${total}`;
  const initials = photoInitials(reviewerName);
  return initials ? `${where} from ${initials}'s review` : `${where} from a customer's review`;
}

/** The 1-based place of a photo inside the review's ordered photo list. */
export function photoNumber(photos: ReviewPhoto[], photoId: string): number {
  const index = sortPhotos(photos).findIndex((photo) => photo.id === photoId);
  return index >= 0 ? index + 1 : 1;
}

/** Hiding a photo removes it from the list, matching the API's read filter. */
export function removePhoto(photos: ReviewPhoto[], photoId: string): ReviewPhoto[] {
  return photos.filter((photo) => photo.id !== photoId);
}

/** Unhiding a photo puts it back in its position among the review's photos. */
export function insertPhoto(photos: ReviewPhoto[], photo: ReviewPhoto): ReviewPhoto[] {
  if (photos.some((existing) => existing.id === photo.id)) {
    return photos.map((existing) => (existing.id === photo.id ? photo : existing));
  }
  return sortPhotos([...photos, photo]);
}

/**
 * Whether the signed-in role may hide and unhide review photos. The API
 * enforces the same rule; this only decides whether the control is shown.
 */
export function canManageReviewPhotos(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
