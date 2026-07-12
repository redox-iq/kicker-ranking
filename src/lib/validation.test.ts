import { describe, expect, it } from "vitest";
import { validateMatchInput } from "./validation";
import type { MatchInput, Player } from "../types";

const players: Player[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  displayName: id.toUpperCase(),
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z"
}));

function validMatch(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    playedAt: "2026-07-11T12:00:00.000Z",
    teamAScore: 10,
    teamBScore: 7,
    note: "",
    slots: [
      { playerId: "a", team: "A", role: "defense" },
      { playerId: "b", team: "A", role: "attack" },
      { playerId: "c", team: "B", role: "defense" },
      { playerId: "d", team: "B", role: "attack" }
    ],
    ...overrides
  };
}

describe("validateMatchInput", () => {
  it("accepts a complete 2v2 match with one role per team", () => {
    expect(validateMatchInput(validMatch(), players)).toEqual([]);
  });

  it("rejects duplicate players", () => {
    const errors = validateMatchInput(
      validMatch({
        slots: [
          { playerId: "a", team: "A", role: "defense" },
          { playerId: "a", team: "A", role: "attack" },
          { playerId: "c", team: "B", role: "defense" },
          { playerId: "d", team: "B", role: "attack" }
        ]
      }),
      players
    );

    expect(errors).toContain("Ein Spieler darf in einem Match nur einmal vorkommen.");
  });

  it("rejects negative scores", () => {
    const errors = validateMatchInput(validMatch({ teamAScore: -1 }), players);

    expect(errors).toContain("Spielstaende duerfen nicht negativ sein.");
  });
});
