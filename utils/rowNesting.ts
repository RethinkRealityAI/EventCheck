// Nest each row under its parent row, when the parent is in the same list.
//
// The Live list used to nest only four guest types (pending-claim, claimed,
// adult, child), and only when parent and guest landed on the same page. A
// TSCS companion, a BOGO guest or a sponsor's delegate therefore sat in the
// list as a loose row — "- -  GUEST" under someone else entirely — and seeing
// an organisation's people meant opening its Actions modal.
//
// The rule here is structural, not a list of types: a row nests under its
// parent whenever that parent is in the same (already filtered) set.
//   * A row whose parent is filtered out stays top-level, so a search that
//     matches only a guest still finds the guest.
//   * Pagination runs over `top`, so a party never splits across pages.
//   * Order is preserved: top-level rows keep the caller's order, children
//     are ordered by `compareChildren` when given, else by input order.

export interface NestableRow {
  id: string;
  primaryAttendeeId?: string | null;
}

export interface NestedRows<T> {
  /** Rows with no parent in the set, in input order. */
  top: T[];
  /** Parent id → its children in the set. Only parents with children appear. */
  childrenOf: Map<string, T[]>;
}

export function nestUnderParents<T extends NestableRow>(
  rows: readonly T[],
  compareChildren?: (a: T, b: T) => number,
): NestedRows<T> {
  const ids = new Set(rows.map(r => r.id));
  const top: T[] = [];
  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    const parent = row.primaryAttendeeId;
    if (parent && parent !== row.id && ids.has(parent)) {
      const list = childrenOf.get(parent);
      if (list) list.push(row);
      else childrenOf.set(parent, [row]);
    } else {
      top.push(row);
    }
  }
  if (compareChildren) {
    for (const list of childrenOf.values()) list.sort(compareChildren);
  }
  return { top, childrenOf };
}
