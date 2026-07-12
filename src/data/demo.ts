import type { KickerData } from "../types";

export const demoData: KickerData = {
  players: [
    { id: "p-lina", displayName: "Lina", active: true, createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "p-malte", displayName: "Malte", active: true, createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "p-jana", displayName: "Jana", active: true, createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "p-omer", displayName: "Omer", active: true, createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "p-noah", displayName: "Noah", active: true, createdAt: "2026-06-01T10:00:00.000Z" },
    { id: "p-sara", displayName: "Sara", active: true, createdAt: "2026-06-01T10:00:00.000Z" }
  ],
  matches: [
    {
      id: "m-001",
      playedAt: "2026-07-01T13:20:00.000Z",
      teamAScore: 10,
      teamBScore: 7,
      note: "Mensapause",
      slots: [
        { matchId: "m-001", playerId: "p-lina", team: "A", role: "defense" },
        { matchId: "m-001", playerId: "p-malte", team: "A", role: "attack" },
        { matchId: "m-001", playerId: "p-jana", team: "B", role: "defense" },
        { matchId: "m-001", playerId: "p-omer", team: "B", role: "attack" }
      ]
    },
    {
      id: "m-002",
      playedAt: "2026-07-03T16:05:00.000Z",
      teamAScore: 6,
      teamBScore: 10,
      slots: [
        { matchId: "m-002", playerId: "p-noah", team: "A", role: "defense" },
        { matchId: "m-002", playerId: "p-sara", team: "A", role: "attack" },
        { matchId: "m-002", playerId: "p-lina", team: "B", role: "defense" },
        { matchId: "m-002", playerId: "p-omer", team: "B", role: "attack" }
      ]
    },
    {
      id: "m-003",
      playedAt: "2026-07-05T12:40:00.000Z",
      teamAScore: 10,
      teamBScore: 3,
      note: "Klares Ding",
      slots: [
        { matchId: "m-003", playerId: "p-jana", team: "A", role: "defense" },
        { matchId: "m-003", playerId: "p-malte", team: "A", role: "attack" },
        { matchId: "m-003", playerId: "p-noah", team: "B", role: "defense" },
        { matchId: "m-003", playerId: "p-sara", team: "B", role: "attack" }
      ]
    },
    {
      id: "m-004",
      playedAt: "2026-07-08T18:10:00.000Z",
      teamAScore: 9,
      teamBScore: 10,
      slots: [
        { matchId: "m-004", playerId: "p-lina", team: "A", role: "defense" },
        { matchId: "m-004", playerId: "p-sara", team: "A", role: "attack" },
        { matchId: "m-004", playerId: "p-jana", team: "B", role: "defense" },
        { matchId: "m-004", playerId: "p-omer", team: "B", role: "attack" }
      ]
    }
  ]
};
