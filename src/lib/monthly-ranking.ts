export function localMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// YYYY-MM keys sort chronologically; current and future months are not complete.
export function rankCompletedMonths<T extends { key: string }>(
  months: readonly T[],
  score: (month: T) => number,
  currentMonthKey: string,
): { best: T | null; worst: T | null } {
  const completed = months.filter((month) => month.key < currentMonthKey);
  if (!completed.length) return { best: null, worst: null };
  return {
    best: completed.reduce((best, month) => score(month) > score(best) ? month : best),
    worst: completed.reduce((worst, month) => score(month) < score(worst) ? month : worst),
  };
}