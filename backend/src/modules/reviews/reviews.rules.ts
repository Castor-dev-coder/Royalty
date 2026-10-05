export type ReviewEligibility = 'ELIGIBLE' | 'NOT_OWNER' | 'NOT_COMPLETED' | 'ALREADY_REVIEWED';

export function getReviewEligibility(
  appointmentStatus: string,
  isOwner: boolean,
  alreadyReviewed: boolean
): ReviewEligibility {
  if (!isOwner) return 'NOT_OWNER';
  if (appointmentStatus !== 'COMPLETED') return 'NOT_COMPLETED';
  if (alreadyReviewed) return 'ALREADY_REVIEWED';
  return 'ELIGIBLE';
}