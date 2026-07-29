// Dashboard filter helpers.
//
// The attendee list already filters on attendance + payment + per-form response
// values. Two things were missing and both cost admins time:
//
//   1. No way to ask "who can't sign in?" — i.e. which attendees have no linked
//      portal account. That is the question the new account-management tools
//      (password reset / magic link / create account) are answered against, so
//      it needs to be filterable, not eyeballed.
//   2. No feedback about what is currently filtered. With four independent
//      controls (search, attendance, payment, response values) it was easy to
//      leave one set and conclude the data was missing. A summary + one-click
//      reset removes that whole class of confusion.
//
// Pure + data-only so both are unit-tested (CLAUDE.md §16 rule #14).

export const ACCOUNT_FILTERS = ['all', 'linked', 'none'] as const;
export type AccountFilter = typeof ACCOUNT_FILTERS[number];

export const ACCOUNT_FILTER_LABELS: Record<AccountFilter, string> = {
  all: 'Any account',
  linked: 'Has portal login',
  none: 'No portal login',
};

/** The subset of an attendee row the account filter looks at. */
export interface AccountFilterableAttendee {
  userId?: string | null;
}

export function matchesAccountFilter(a: AccountFilterableAttendee, filter: AccountFilter): boolean {
  if (filter === 'all') return true;
  const linked = !!a.userId;
  return filter === 'linked' ? linked : !linked;
}

export interface ActiveFilterState {
  search?: string;
  /** 'all' | 'checked-in' | 'pending' */
  status?: string;
  /** 'all' | 'paid' | 'free' | 'pending' */
  payment?: string;
  account?: AccountFilter;
  /** Count of per-form response filters applied. */
  responseFilterCount?: number;
}

export interface ActiveFilterChip {
  key: 'search' | 'status' | 'payment' | 'account' | 'responses';
  label: string;
}

const STATUS_LABELS: Record<string, string> = {
  'checked-in': 'Checked in',
  'pending': 'Not checked in',
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Paid',
  free: 'Free',
  pending: 'Payment pending',
};

/**
 * One chip per non-default filter, in the order they appear in the toolbar.
 * Empty array ⇒ nothing is filtered, so the UI can hide the summary entirely.
 */
export function describeActiveFilters(state: ActiveFilterState): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const search = (state.search ?? '').trim();
  if (search) chips.push({ key: 'search', label: `Search: "${search}"` });
  if (state.status && state.status !== 'all') {
    chips.push({ key: 'status', label: STATUS_LABELS[state.status] ?? state.status });
  }
  if (state.payment && state.payment !== 'all') {
    chips.push({ key: 'payment', label: PAYMENT_LABELS[state.payment] ?? state.payment });
  }
  if (state.account && state.account !== 'all') {
    chips.push({ key: 'account', label: ACCOUNT_FILTER_LABELS[state.account] });
  }
  const n = state.responseFilterCount ?? 0;
  if (n > 0) chips.push({ key: 'responses', label: `${n} response filter${n > 1 ? 's' : ''}` });
  return chips;
}

export function hasActiveFilters(state: ActiveFilterState): boolean {
  return describeActiveFilters(state).length > 0;
}
