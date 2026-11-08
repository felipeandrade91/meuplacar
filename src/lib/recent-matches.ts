type DatedMatch = { id: string; date: string; created_at?: string };

// Stable order for same-day games, identical after saving and reloading.
export function chronologicalMatches<T extends DatedMatch>(matches: readonly T[]): T[] {
  return [...matches].sort((a, b) => a.date.localeCompare(b.date)
    || (a.created_at ?? "").localeCompare(b.created_at ?? "")
    || a.id.localeCompare(b.id));
}

export function latestFiveMatches<T extends DatedMatch>(matches: readonly T[]): T[] {
  return chronologicalMatches(matches).slice(-5);
}

// Goals, assists and goal participations scored inside the last-five window.
export function lastFiveTotals<T extends DatedMatch & { goals: number; assists: number }>(matches: readonly T[]) {
  const last5 = latestFiveMatches(matches);
  const goals = last5.reduce((sum, m) => sum + m.goals, 0);
  const assists = last5.reduce((sum, m) => sum + m.assists, 0);
  return { games: last5.length, goals, assists, ga: goals + assists };
}

export function withRollingParticipation<T extends { goals: number; assists: number }>(matches: readonly T[]) {
  return matches.map((match, i) => {
    const window = matches.slice(Math.max(0, i - 4), i + 1);
    return { ...match, rolling: window.reduce((sum, m) => sum + m.goals + m.assists, 0) / window.length };
  });
}