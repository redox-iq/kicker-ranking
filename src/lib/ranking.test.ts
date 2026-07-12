import { describe, expect, it } from "vitest";
import { calculateRankings, expectedScore, goalDiffMultiplier } from "./ranking";
import type { MatchRecord, Player } from "../types";

const players: Player[] = [
  { id: "a", displayName: "A", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "b", displayName: "B", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "c", displayName: "C", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "d", displayName: "D", active: true, createdAt: "2026-01-01T00:00:00.000Z" }
];

function match(id: string, teamAScore: number, teamBScore: number): MatchRecord {
  return {
    id,
    playedAt: `2026-07-${id.padStart(2, "0")}T12:00:00.000Z`,
    teamAScore,
    teamBScore,
    slots: [
      { matchId: id, playerId: "a", team: "A", role: "defense" },
      { matchId: id, playerId: "b", team: "A", role: "attack" },
      { matchId: id, playerId: "c", team: "B", role: "defense" },
      { matchId: id, playerId: "d", team: "B", role: "attack" }
    ]
  };
}

describe("ranking", () => {
  it("uses standard Elo expected score", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.75);
  });

  it("caps but rewards goal difference", () => {
    expect(goalDiffMultiplier(1)).toBeGreaterThan(1);
    expect(goalDiffMultiplier(12)).toBeLessThanOrEqual(1.85);
  });

  it("updates players, roles and exact teams deterministically", () => {
    const result = calculateRankings(players, [match("1", 10, 7), match("2", 10, 4)]);
    const teamAPlayers = result.players.filter((standing) => standing.player.id === "a" || standing.player.id === "b");
    const teamBPlayers = result.players.filter((standing) => standing.player.id === "c" || standing.player.id === "d");

    expect(teamAPlayers.every((standing) => standing.overallRating > 1000)).toBe(true);
    expect(teamBPlayers.every((standing) => standing.overallRating < 1000)).toBe(true);
    expect(result.players.find((standing) => standing.player.id === "a")?.defenseGames).toBe(2);
    expect(result.players.find((standing) => standing.player.id === "a")?.attackGames).toBe(0);
    expect(result.teams[0].defensePlayer.id).toBe("a");
    expect(result.teams[0].attackPlayer.id).toBe("b");
  });
});
