import { createClient } from "@supabase/supabase-js";
import { demoData } from "../data/demo";
import type { KickerData, MatchInput, MatchRecord, MatchSlot, Player, PlayerInput } from "../types";

const LOCAL_STORAGE_KEY = "uni-kicker-ranking:data:v1";

export type DataSource = "supabase" | "local";

export interface KickerRepository {
  source: DataSource;
  load(): Promise<KickerData>;
  upsertPlayer(input: PlayerInput, groupCode: string): Promise<void>;
  upsertMatch(input: MatchInput, groupCode: string): Promise<void>;
  deleteMatch(matchId: string, groupCode: string): Promise<void>;
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const repository: KickerRepository = isSupabaseConfigured ? createSupabaseRepository() : createLocalRepository();

export function isUsingSupabase(): boolean {
  return repository.source === "supabase";
}

function createSupabaseRepository(): KickerRepository {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  return {
    source: "supabase",
    async load() {
      const [playersResponse, matchesResponse, slotsResponse] = await Promise.all([
        supabase.from("players").select("*").order("display_name", { ascending: true }),
        supabase.from("matches").select("*").eq("is_deleted", false).order("played_at", { ascending: false }),
        supabase.from("match_slots").select("*")
      ]);

      if (playersResponse.error) {
        throw new Error(playersResponse.error.message);
      }
      if (matchesResponse.error) {
        throw new Error(matchesResponse.error.message);
      }
      if (slotsResponse.error) {
        throw new Error(slotsResponse.error.message);
      }

      const slotsByMatch = new Map<string, MatchSlot[]>();
      for (const row of slotsResponse.data ?? []) {
        const slot = mapSlotRow(row);
        if (!slotsByMatch.has(slot.matchId ?? "")) {
          slotsByMatch.set(slot.matchId ?? "", []);
        }
        slotsByMatch.get(slot.matchId ?? "")?.push(slot);
      }

      return {
        players: (playersResponse.data ?? []).map(mapPlayerRow),
        matches: (matchesResponse.data ?? []).map((row) => mapMatchRow(row, slotsByMatch.get(row.id) ?? []))
      };
    },
    async upsertPlayer(input, groupCode) {
      const { error } = await supabase.rpc("upsert_player", {
        p_group_code: groupCode,
        p_player_id: input.id ?? null,
        p_display_name: input.displayName.trim(),
        p_active: input.active ?? true
      });

      if (error) {
        throw new Error(error.message);
      }
    },
    async upsertMatch(input, groupCode) {
      const payload = {
        p_group_code: groupCode,
        p_played_at: input.playedAt,
        p_team_a_score: input.teamAScore,
        p_team_b_score: input.teamBScore,
        p_note: input.note?.trim() || null,
        p_slots: input.slots.map((slot) => ({
          player_id: slot.playerId,
          team: slot.team,
          role: slot.role
        }))
      };

      const response = input.id
        ? await supabase.rpc("update_match", { p_match_id: input.id, ...payload })
        : await supabase.rpc("submit_match", payload);

      if (response.error) {
        throw new Error(response.error.message);
      }
    },
    async deleteMatch(matchId, groupCode) {
      const { error } = await supabase.rpc("delete_match", {
        p_group_code: groupCode,
        p_match_id: matchId
      });

      if (error) {
        throw new Error(error.message);
      }
    }
  };
}

function createLocalRepository(): KickerRepository {
  return {
    source: "local",
    async load() {
      return readLocalData();
    },
    async upsertPlayer(input, groupCode) {
      assertLocalCode(groupCode);
      const data = readLocalData();
      const now = new Date().toISOString();
      const name = input.displayName.trim();

      if (input.id) {
        data.players = data.players.map((player) =>
          player.id === input.id
            ? { ...player, displayName: name, active: input.active ?? player.active, updatedAt: now }
            : player
        );
      } else {
        data.players.push({
          id: createId("p"),
          displayName: name,
          active: true,
          createdAt: now,
          updatedAt: now
        });
      }

      writeLocalData(data);
    },
    async upsertMatch(input, groupCode) {
      assertLocalCode(groupCode);
      const data = readLocalData();
      const now = new Date().toISOString();
      const matchId = input.id ?? createId("m");
      const match: MatchRecord = {
        id: matchId,
        playedAt: input.playedAt,
        teamAScore: input.teamAScore,
        teamBScore: input.teamBScore,
        note: input.note?.trim() || undefined,
        createdAt: input.id ? data.matches.find((candidate) => candidate.id === input.id)?.createdAt : now,
        updatedAt: now,
        slots: input.slots.map((slot) => ({ ...slot, matchId }))
      };

      if (input.id) {
        data.matches = data.matches.map((candidate) => (candidate.id === input.id ? match : candidate));
      } else {
        data.matches.push(match);
      }

      writeLocalData(data);
    },
    async deleteMatch(matchId, groupCode) {
      assertLocalCode(groupCode);
      const data = readLocalData();
      data.matches = data.matches.filter((match) => match.id !== matchId);
      writeLocalData(data);
    }
  };
}

function readLocalData(): KickerData {
  const fallback = cloneData(demoData);

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      writeLocalData(fallback);
      return fallback;
    }

    const parsed = JSON.parse(raw) as KickerData;
    return {
      players: parsed.players ?? [],
      matches: parsed.matches ?? []
    };
  } catch {
    writeLocalData(fallback);
    return fallback;
  }
}

function writeLocalData(data: KickerData): void {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

function assertLocalCode(groupCode: string): void {
  const expected = import.meta.env.VITE_LOCAL_GROUP_CODE?.trim() || "kicker";
  if (groupCode.trim() !== expected) {
    throw new Error("Gruppen-Code ist falsch. Im lokalen Demo-Modus lautet er standardmaessig: kicker.");
  }
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function cloneData(data: KickerData): KickerData {
  return JSON.parse(JSON.stringify(data)) as KickerData;
}

function mapPlayerRow(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined
  };
}

function mapSlotRow(row: Record<string, unknown>): MatchSlot {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    playerId: String(row.player_id),
    team: row.team === "A" ? "A" : "B",
    role: row.role === "defense" ? "defense" : "attack"
  };
}

function mapMatchRow(row: Record<string, unknown>, slots: MatchSlot[]): MatchRecord {
  return {
    id: String(row.id),
    playedAt: String(row.played_at),
    teamAScore: Number(row.team_a_score),
    teamBScore: Number(row.team_b_score),
    note: row.note ? String(row.note) : undefined,
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    slots
  };
}
