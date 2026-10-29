export interface ScoreEntry {
  score: number;
  level: number;
  drops: number;
  date: number;
}

const KEY = "driftspleef.scores.v2";

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e: any) => typeof e?.score === "number")
      .sort((a: ScoreEntry, b: ScoreEntry) => b.score - a.score)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): {
  list: ScoreEntry[];
  rank: number;
} {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 8);
  const rank = trimmed.indexOf(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return { list: trimmed, rank };
}

export function bestScore(): number {
  const l = loadScores();
  return l.length ? l[0].score : 0;
}
