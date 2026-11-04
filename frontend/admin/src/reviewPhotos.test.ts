import { describe, expect, it } from 'vitest';
import {
  canManageReviewPhotos,
  insertPhoto,
  photoAltText,
  photoInitials,
  photoNumber,
  removePhoto,
  sortPhotos,
  type ReviewPhoto,
} from './reviewPhotos';

const photos: ReviewPhoto[] = [
  { id: 'p3', position: 2, url: 'https://cdn/third.jpg' },
  { id: 'p1', position: 0, url: 'https://cdn/first.jpg' },
  { id: 'p2', position: 1, url: 'https://cdn/second.jpg' },
];

describe('photoInitials', () => {
  it('takes the first and last name letters', () => {
    expect(photoInitials('Maria Santos')).toBe('MS');
  });

  it('gives one letter for a single name', () => {
    expect(photoInitials('maria')).toBe('M');
  });

  it('is empty when there is no name to derive from', () => {
    expect(photoInitials('')).toBe('');
    expect(photoInitials('   ')).toBe('');
  });
});

describe('photoAltText', () => {
  it('names the 1-based position, the total and the customer initials', () => {
    expect(photoAltText(1, 3, 'Maria Santos')).toBe("Photo 1 of 3 from MS's review");
    expect(photoAltText(3, 3, 'Maria Santos')).toBe("Photo 3 of 3 from MS's review");
  });

  it('falls back to "a customer" when no reviewer name is available', () => {
    expect(photoAltText(2, 5, '')).toBe("Photo 2 of 5 from a customer's review");
  });
});

describe('photo list bookkeeping', () => {
  it('orders photos by their position', () => {
    expect(sortPhotos(photos).map((photo) => photo.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('reports the 1-based number of a photo in the ordered list', () => {
    expect(photoNumber(photos, 'p1')).toBe(1);
    expect(photoNumber(photos, 'p3')).toBe(3);
  });

  it('removes a hidden photo like the API read filter does', () => {
    expect(removePhoto(sortPhotos(photos), 'p2').map((photo) => photo.id)).toEqual(['p1', 'p3']);
  });

  it('restores an unhidden photo into its old position', () => {
    const visible = removePhoto(sortPhotos(photos), 'p2');
    const restored = insertPhoto(visible, { id: 'p2', position: 1, url: 'https://cdn/second.jpg', hidden: false });
    expect(restored.map((photo) => photo.id)).toEqual(['p1', 'p2', 'p3']);
    expect(restored[1]!.hidden).toBe(false);
  });

  it('updates in place when the photo is already listed', () => {
    const updated = insertPhoto(sortPhotos(photos), { id: 'p2', position: 1, url: 'https://cdn/second.jpg', hidden: true });
    expect(updated).toHaveLength(3);
    expect(updated[1]!.hidden).toBe(true);
  });
});

describe('canManageReviewPhotos', () => {
  it('allows the staff roles that moderate photos', () => {
    expect(canManageReviewPhotos('ADMIN')).toBe(true);
    expect(canManageReviewPhotos('MANAGER')).toBe(true);
  });

  it('hides the control from everyone else', () => {
    expect(canManageReviewPhotos('STAFF')).toBe(false);
    expect(canManageReviewPhotos('CUSTOMER')).toBe(false);
    expect(canManageReviewPhotos(null)).toBe(false);
    expect(canManageReviewPhotos(undefined)).toBe(false);
  });
});
