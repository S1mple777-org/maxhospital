// Doctor's waiting list order.
//  1. "First in queue" requests go to the top (in the order they arrived).
//  2. Everyone else waits in arrival order, but a Pro / Premium request is moved up
//     `queue_boost` places (Pro 4, Premium 6 by default) — never above "first in queue".
// The move is limited, so a Free patient who has waited longer is overtaken by at most a few people.

export interface QueueItem {
  id: string;
  created_at: string;
  queue_boost?: number | null;
  queue_first?: boolean | null;
}

export function orderQueue<T extends QueueItem>(items: T[]): T[] {
  const byTime = (a: T, b: T) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  const first = items.filter((i) => i.queue_first).sort(byTime);
  const rest = items.filter((i) => !i.queue_first).sort(byTime);
  // Position after the boost; a boosted request lands just in front of the patient at that position.
  const keyed = rest.map((item, index) => {
    const boost = Math.max(0, Math.floor(item.queue_boost ?? 0));
    return { item, key: boost > 0 ? Math.max(index - boost, 0) - 0.5 : index, index };
  });
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);
  return [...first, ...keyed.map((k) => k.item)];
}
