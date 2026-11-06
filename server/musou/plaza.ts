// Двор обители — присутствие, не бой. Забег остаётся комнатой на 2–4.
// Один осколок держит PLAZA_CAP сокетов. Реестр выбирает осколок с местом.
// Восемь осколков — потолок этой поставки, не обещание тысяч.

export const PLAZA_CAP = 24;
export const PLAZA_SHARDS = 8;

export function plazaName(i: number) {
  return `plaza-${Math.max(0, Math.min(PLAZA_SHARDS - 1, i | 0))}`;
}

export function pickShard(counts: number[]): { shard: number; n: number } | { err: string } {
  let best = -1;
  let bestN = PLAZA_CAP;
  for (let i = 0; i < PLAZA_SHARDS; i++) {
    const n = Math.max(0, counts[i] | 0);
    if (n < PLAZA_CAP && (best < 0 || n < bestN)) {
      best = i;
      bestN = n;
    }
  }
  if (best < 0) return { err: "Двор обители полон" };
  return { shard: best, n: bestN };
}
