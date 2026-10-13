import { describe, expect, test } from "bun:test";
import { chronologicalMatches, latestFiveMatches, withRollingParticipation } from "./recent-matches";

const games = Array.from({ length: 7 }, (_, i) => ({
  id: String(i), date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  created_at: `2026-10-13T00:0${i}:00Z`, goals: i + 1, assists: 1, my_team_score: (i + 1) * 2,
}));
describe("recent match windows", () => {
  test("uses dates, not insertion or fetch order, and never mutates input", () => {
    const input = [...games].reverse();
    expect(latestFiveMatches(input).map(m => m.id)).toEqual(["2", "3", "4", "5", "6"]);
    expect(input[0].id).toBe("6");
  });
  test("same-day games keep their creation order after a reload", () => {
    const sameDay = games.map(m => ({ ...m, date: "2026-10-12" }));
    expect(latestFiveMatches(sameDay).map(m => m.id)).toEqual(latestFiveMatches([...sameDay].reverse()).map(m => m.id));
  });
  test("fewer than five, no matches, and period-filtered matches", () => {
    expect(latestFiveMatches([])).toEqual([]);
    expect(latestFiveMatches(games.slice(0, 2))).toHaveLength(2);
    expect(latestFiveMatches(games.filter(m => m.date >= "2026-10-05"))).toHaveLength(3);
  });
  test("updates recent goal share when a new match enters the window", () => {
    const initial = latestFiveMatches(games);
    expect(initial.reduce((sum, m) => sum + m.goals, 0)).toBe(25);
    expect(initial.reduce((sum, m) => sum + m.my_team_score, 0)).toBe(50);
    const added = { ...games[0], id: "new", date: "2026-10-08", goals: 10, my_team_score: 12 };
    const next = latestFiveMatches([...games, added]);
    expect(next.reduce((sum, m) => sum + m.goals, 0)).toBe(32);
    expect(next.reduce((sum, m) => sum + m.my_team_score, 0)).toBe(56);
  });
  test("rolling averages use at most five games and the actual sample size", () => {
    const rolling = withRollingParticipation(chronologicalMatches([...games].reverse()));
    expect(rolling[0].rolling).toBe(2);
    expect(rolling[1].rolling).toBe(2.5);
    expect(rolling[6].rolling).toBe(6);
  });
});