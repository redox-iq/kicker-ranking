import type {
  MatchRecord,
  MatchResult,
  MatchSlot,
  Player,
  PlayerStanding,
  RankingsResult,
  Role,
  TeamKey,
  TeamStanding
} from "../types";
import { hasCompleteSlots } from "./validation";

const INITIAL_RATING = 1000;
const BASE_K = 24;
const PROVISIONAL_K = 42;
const TEAM_K = 28;

type MutablePlayerStanding = PlayerStanding;
type MutableTeamStanding = TeamStanding;

export function calculateRankings(players: Player[], matches: MatchRecord[]): RankingsResult {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const standings = new Map<string, MutablePlayerStanding>();
  const teams = new Map<string, MutableTeamStanding>();

  for (const player of players) {
    standings.set(player.id, createPlayerStanding(player));
  }

  const validMatches = matches
    .filter((match) => !match.isDeleted && hasCompleteSlots(match.slots))
    .sort((left, right) => {
      const byDate = new Date(left.playedAt).getTime() - new Date(right.playedAt).getTime();
      return byDate || left.id.localeCompare(right.id);
    });

  for (const match of validMatches) {
    for (const slot of match.slots) {
      const player = playersById.get(slot.playerId);
      if (player && !standings.has(player.id)) {
        standings.set(player.id, createPlayerStanding(player));
      }
    }

    const teamASlots = getTeamSlots(match.slots, "A");
    const teamBSlots = getTeamSlots(match.slots, "B");
    if (!teamASlots || !teamBSlots) {
      continue;
    }

    const teamAStandings = teamASlots.map((slot) => standings.get(slot.playerId)).filter(Boolean) as MutablePlayerStanding[];
    const teamBStandings = teamBSlots.map((slot) => standings.get(slot.playerId)).filter(Boolean) as MutablePlayerStanding[];
    if (teamAStandings.length !== 2 || teamBStandings.length !== 2) {
      continue;
    }

    const actualA = actualScore(match.teamAScore, match.teamBScore);
    const actualB = 1 - actualA;
    const resultA = resultFor(match.teamAScore, match.teamBScore);
    const resultB = resultFor(match.teamBScore, match.teamAScore);
    const multiplier = goalDiffMultiplier(Math.abs(match.teamAScore - match.teamBScore));

    const teamARating = average(teamAStandings.map((standing) => standing.overallRating));
    const teamBRating = average(teamBStandings.map((standing) => standing.overallRating));
    const expectedA = expectedScore(teamARating, teamBRating);
    const expectedB = 1 - expectedA;

    updatePlayers(teamAStandings, match.teamAScore, match.teamBScore, actualA, expectedA, multiplier, resultA, teamASlots);
    updatePlayers(teamBStandings, match.teamBScore, match.teamAScore, actualB, expectedB, multiplier, resultB, teamBSlots);

    const teamA = getOrCreateTeam(teams, teamASlots, playersById);
    const teamB = getOrCreateTeam(teams, teamBSlots, playersById);
    if (teamA && teamB) {
      const teamExpectedA = expectedScore(teamA.rating, teamB.rating);
      updateTeam(teamA, match.teamAScore, match.teamBScore, actualA, teamExpectedA, multiplier, resultA);
      updateTeam(teamB, match.teamBScore, match.teamAScore, actualB, 1 - teamExpectedA, multiplier, resultB);
    }
  }

  const recentMatches = [...validMatches].sort((left, right) => {
    const byDate = new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime();
    return byDate || right.id.localeCompare(left.id);
  });

  return {
    players: [...standings.values()].sort(comparePlayerStandings),
    teams: [...teams.values()].sort(compareTeamStandings),
    recentMatches: recentMatches.slice(0, 8),
    biggestWins: [...validMatches]
      .filter((match) => match.teamAScore !== match.teamBScore)
      .sort((left, right) => Math.abs(right.teamAScore - right.teamBScore) - Math.abs(left.teamAScore - left.teamBScore))
      .slice(0, 8)
  };
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function goalDiffMultiplier(goalDiff: number): number {
  if (goalDiff <= 0) {
    return 1;
  }

  return Math.min(1.85, 1 + Math.log2(goalDiff + 1) * 0.22);
}

function createPlayerStanding(player: Player): MutablePlayerStanding {
  return {
    player,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    overallRating: INITIAL_RATING,
    attackRating: INITIAL_RATING,
    defenseRating: INITIAL_RATING,
    attackGames: 0,
    defenseGames: 0,
    attackGoalsFor: 0,
    defenseGoalsAgainst: 0,
    lastResults: []
  };
}

function getTeamSlots(slots: MatchSlot[], team: TeamKey): MatchSlot[] | null {
  const teamSlots = slots.filter((slot) => slot.team === team);
  const hasDefense = teamSlots.some((slot) => slot.role === "defense");
  const hasAttack = teamSlots.some((slot) => slot.role === "attack");
  return teamSlots.length === 2 && hasDefense && hasAttack ? teamSlots : null;
}

function updatePlayers(
  teamStandings: MutablePlayerStanding[],
  goalsFor: number,
  goalsAgainst: number,
  actual: number,
  expected: number,
  multiplier: number,
  result: MatchResult,
  slots: MatchSlot[]
): void {
  for (const standing of teamStandings) {
    const slot = slots.find((candidate) => candidate.playerId === standing.player.id);
    if (!slot) {
      continue;
    }

    const k = standing.games < 10 ? PROVISIONAL_K : BASE_K;
    const delta = k * multiplier * (actual - expected);

    standing.games += 1;
    standing.goalsFor += goalsFor;
    standing.goalsAgainst += goalsAgainst;
    standing.goalDiff = standing.goalsFor - standing.goalsAgainst;
    standing.overallRating += delta;
    standing.lastResults = [result, ...standing.lastResults].slice(0, 5);

    if (result === "win") {
      standing.wins += 1;
    } else if (result === "loss") {
      standing.losses += 1;
    } else {
      standing.draws += 1;
    }

    if (slot.role === "attack") {
      standing.attackGames += 1;
      standing.attackGoalsFor += goalsFor;
      standing.attackRating += delta;
    } else {
      standing.defenseGames += 1;
      standing.defenseGoalsAgainst += goalsAgainst;
      standing.defenseRating += delta;
    }
  }
}

function getOrCreateTeam(
  teams: Map<string, MutableTeamStanding>,
  slots: MatchSlot[],
  playersById: Map<string, Player>
): MutableTeamStanding | null {
  const defenseSlot = slots.find((slot) => slot.role === "defense");
  const attackSlot = slots.find((slot) => slot.role === "attack");
  if (!defenseSlot || !attackSlot) {
    return null;
  }

  const defensePlayer = playersById.get(defenseSlot.playerId);
  const attackPlayer = playersById.get(attackSlot.playerId);
  if (!defensePlayer || !attackPlayer) {
    return null;
  }

  const key = `${defensePlayer.id}:${attackPlayer.id}`;
  const existing = teams.get(key);
  if (existing) {
    return existing;
  }

  const created: MutableTeamStanding = {
    key,
    defensePlayer,
    attackPlayer,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    rating: INITIAL_RATING,
    lastResults: []
  };
  teams.set(key, created);
  return created;
}

function updateTeam(
  team: MutableTeamStanding,
  goalsFor: number,
  goalsAgainst: number,
  actual: number,
  expected: number,
  multiplier: number,
  result: MatchResult
): void {
  team.games += 1;
  team.goalsFor += goalsFor;
  team.goalsAgainst += goalsAgainst;
  team.goalDiff = team.goalsFor - team.goalsAgainst;
  team.rating += TEAM_K * multiplier * (actual - expected);
  team.lastResults = [result, ...team.lastResults].slice(0, 5);

  if (result === "win") {
    team.wins += 1;
  } else if (result === "loss") {
    team.losses += 1;
  } else {
    team.draws += 1;
  }
}

function actualScore(goalsFor: number, goalsAgainst: number): number {
  if (goalsFor > goalsAgainst) {
    return 1;
  }

  if (goalsFor < goalsAgainst) {
    return 0;
  }

  return 0.5;
}

function resultFor(goalsFor: number, goalsAgainst: number): MatchResult {
  if (goalsFor > goalsAgainst) {
    return "win";
  }

  if (goalsFor < goalsAgainst) {
    return "loss";
  }

  return "draw";
}

function comparePlayerStandings(left: PlayerStanding, right: PlayerStanding): number {
  return right.overallRating - left.overallRating || right.games - left.games || left.player.displayName.localeCompare(right.player.displayName);
}

function compareTeamStandings(left: TeamStanding, right: TeamStanding): number {
  return right.rating - left.rating || right.games - left.games || left.key.localeCompare(right.key);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}
