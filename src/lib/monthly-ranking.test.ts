import { describe, expect, test } from "bun:test";
import { localMonthKey, rankCompletedMonths } from "./monthly-ranking";

const months = [
  { key: "2026-09", goals: 8, assists: 4, w: 2, d: 1 },
  { key: "2026-10", goals: 15, assists: 5, w: 4, d: 0 },
  { key: "2026-11", goals: 2, assists: 2, w: 1, d: 0 },
];
describe("completed month rankings", () => {
  test("participations exclude the current month, even when it has the lowest or highest total", () => {
    for (const goals of [2, 100]) {
      const input = months.map(m => m.key === "2026-11" ? { ...m, goals } : m);
      const ranked = rankCompletedMonths(input, m => m.goals + m.assists, "2026-11");
      expect(ranked.best?.key).toBe("2026-10");
      expect(ranked.worst?.key).toBe("2026-09");
    }
  });
  test("results exclude the current month and retain the points criterion", () => {
    const ranked = rankCompletedMonths(months, m => m.w * 3 + m.d, "2026-11");
    expect(ranked.best?.key).toBe("2026-10");
    expect(ranked.worst?.key).toBe("2026-09");
  });
  test("a month becomes eligible only after it ends, including a year change", () => {
    expect(rankCompletedMonths(months, m => m.goals + m.assists, "2026-12").worst?.key).toBe("2026-11");
    expect(rankCompletedMonths([{ key: "2026-12", points: 3 }, { key: "2027-01", points: 0 }], m => m.points, "2027-01").worst?.key).toBe("2026-12");
    expect(localMonthKey(new Date(2027, 0, 1))).toBe("2027-01");
  });
  test("no completed months produce no best or worst, and future months stay excluded", () => {
    expect(rankCompletedMonths([], () => 0, "2026-11")).toEqual({ best: null, worst: null });
    expect(rankCompletedMonths(months.slice(2), m => m.goals, "2026-11")).toEqual({ best: null, worst: null });
    expect(rankCompletedMonths([{ key: "2026-12", goals: 100 }], m => m.goals, "2026-11")).toEqual({ best: null, worst: null });
  });
});