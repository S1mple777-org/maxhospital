// Doctor's waiting list order.
//  0. Booked appointments whose time has come go first, in order of their booked time
//     (the patient reserved that time; future bookings are not in the live queue at all).
//  1. "First in queue" requests go next (in the order they arrived).
//  2. Everyone else waits in arrival order, but a Pro / Premium request is moved up
//     `queue_boost` places (Pro 4, Premium 6 by default) — never above "first in queue".
// The move is limited, so a Free patient who has waited longer is overtaken by at most a few people.
// The same order is computed in SQL by public.queue_status() (migration 20261024170000_booking_queue.sql).

export interface QueueItem {
  id: string;
  created_at: string;
  queue_boost?: number | null;
  queue_first?: boolean | null;
  scheduled_at?: string | null;
}

/** A booked appointment joins the live queue 15 minutes before its time. */
export const BOOKING_JOIN_MS = 15 * 60_000;

export const isFutureBooking = (item: Pick<QueueItem, "scheduled_at">, now = Date.now()) =>
  !!item.scheduled_at && Date.parse(item.scheduled_at) > now + BOOKING_JOIN_MS;

export function orderQueue<T extends QueueItem>(items: T[]): T[] {
  const byTime = (a: T, b: T) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  const booked = items.filter((i) => i.scheduled_at)
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!) || byTime(a, b));
  const live = items.filter((i) => !i.scheduled_at);
  const first = live.filter((i) => i.queue_first).sort(byTime);
  const rest = live.filter((i) => !i.queue_first).sort(byTime);
  // Position after the boost; a boosted request lands just in front of the patient at that position.
  const keyed = rest.map((item, index) => {
    const boost = Math.max(0, Math.floor(item.queue_boost ?? 0));
    return { item, key: boost > 0 ? Math.max(index - boost, 0) - 0.5 : index, index };
  });
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);
  return [...booked, ...first, ...keyed.map((k) => k.item)];
}
