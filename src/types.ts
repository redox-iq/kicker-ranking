export type TeamKey = "A" | "B";
export type Role = "defense" | "attack";
export type MatchResult = "win" | "draw" | "loss";

export interface Player {
  id: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface MatchSlot {
  id?: string;
  matchId?: string;
  playerId: string;
  team: TeamKey;
  role: Role;
}

export interface MatchRecord {
  id: string;
  playedAt: string;
  teamAScore: number;
  teamBScore: number;
  note?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  slots: MatchSlot[];
}

export interface KickerData {
  players: Player[];
  matches: MatchRecord[];
}

export interface MatchInput {
  id?: string;
  playedAt: string;
  teamAScore: number;
  teamBScore: number;
  note?: string;
  slots: MatchSlot[];
}

export interface PlayerInput {
  id?: string;
  displayName: string;
  active?: boolean;
}

export interface PlayerStanding {
  player: Player;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  overallRating: number;
  attackRating: number;
  defenseRating: number;
  attackGames: number;
  defenseGames: number;
  attackGoalsFor: number;
  defenseGoalsAgainst: number;
  lastResults: MatchResult[];
}

export interface TeamStanding {
  key: string;
  defensePlayer: Player;
  attackPlayer: Player;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  rating: number;
  lastResults: MatchResult[];
}

export interface RankingsResult {
  players: PlayerStanding[];
  teams: TeamStanding[];
  recentMatches: MatchRecord[];
  biggestWins: MatchRecord[];
}
