export const variationTransitions: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned'],
  under_review: ['approved', 'rejected', 'returned'],
  returned: ['draft', 'submitted'],
  approved: ['incorporated'],
  rejected: [],
  incorporated: [],
  cancelled: [],
};
