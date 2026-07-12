import type { MatchInput, MatchSlot, Player, Role, TeamKey } from "../types";

const roleLabels: Record<Role, string> = {
  defense: "Abwehr/Tor",
  attack: "Angriff"
};

export function validateDisplayName(displayName: string): string[] {
  const name = displayName.trim();
  const errors: string[] = [];

  if (!name) {
    errors.push("Name darf nicht leer sein.");
  }

  if (name.length > 40) {
    errors.push("Name darf maximal 40 Zeichen lang sein.");
  }

  return errors;
}

export function validateMatchInput(input: MatchInput, players: Player[]): string[] {
  const errors: string[] = [];
  const activePlayerIds = new Set(players.filter((player) => player.active).map((player) => player.id));

  if (!Number.isInteger(input.teamAScore) || !Number.isInteger(input.teamBScore)) {
    errors.push("Spielstaende muessen ganze Zahlen sein.");
  }

  if (input.teamAScore < 0 || input.teamBScore < 0) {
    errors.push("Spielstaende duerfen nicht negativ sein.");
  }

  if (!input.playedAt || Number.isNaN(Date.parse(input.playedAt))) {
    errors.push("Spieldatum ist ungueltig.");
  }

  const filledSlots = input.slots.filter((slot) => slot.playerId);
  if (filledSlots.length !== 4) {
    errors.push("Es muessen genau vier Spieler ausgewaehlt werden.");
  }

  const selectedPlayerIds = filledSlots.map((slot) => slot.playerId);
  if (new Set(selectedPlayerIds).size !== selectedPlayerIds.length) {
    errors.push("Ein Spieler darf in einem Match nur einmal vorkommen.");
  }

  for (const playerId of selectedPlayerIds) {
    if (!activePlayerIds.has(playerId)) {
      errors.push("Alle ausgewaehlten Spieler muessen aktiv sein.");
      break;
    }
  }

  for (const team of ["A", "B"] as TeamKey[]) {
    for (const role of ["defense", "attack"] as Role[]) {
      const count = filledSlots.filter((slot) => slot.team === team && slot.role === role).length;
      if (count !== 1) {
        errors.push(`Team ${team} braucht genau einen Spieler fuer ${roleLabels[role]}.`);
      }
    }
  }

  return [...new Set(errors)];
}

export function hasCompleteSlots(slots: MatchSlot[]): boolean {
  return validateSlotShape(slots).length === 0;
}

export function validateSlotShape(slots: MatchSlot[]): string[] {
  const errors: string[] = [];

  if (slots.length !== 4) {
    errors.push("Ein Match braucht genau vier Rollenplaetze.");
  }

  const byPlayer = new Set(slots.map((slot) => slot.playerId));
  if (byPlayer.size !== slots.length) {
    errors.push("Spieler duerfen nicht doppelt vorkommen.");
  }

  for (const team of ["A", "B"] as TeamKey[]) {
    for (const role of ["defense", "attack"] as Role[]) {
      const count = slots.filter((slot) => slot.team === team && slot.role === role).length;
      if (count !== 1) {
        errors.push(`Rolle fehlt: Team ${team} ${roleLabels[role]}.`);
      }
    }
  }

  return errors;
}
