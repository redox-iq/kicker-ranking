import {
  BarChart3,
  CalendarDays,
  Edit3,
  Goal,
  Home,
  KeyRound,
  ListPlus,
  Medal,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Swords,
  Trash2,
  Trophy,
  Users,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { calculateRankings } from "./lib/ranking";
import { repository } from "./lib/repository";
import { validateDisplayName, validateMatchInput } from "./lib/validation";
import type { KickerData, MatchInput, MatchRecord, MatchResult, MatchSlot, Player, PlayerStanding, Role, TeamKey, TeamStanding } from "./types";

type RoutePath = "/" | "/matches" | "/rankings" | "/stats" | "/players";
type RankingTab = "overall" | "attack" | "defense" | "teams";

const routes: Array<{ path: RoutePath; label: string; icon: typeof Home }> = [
  { path: "/", label: "Übersicht", icon: Home },
  { path: "/matches", label: "Spiele", icon: ListPlus },
  { path: "/rankings", label: "Rankings", icon: Trophy },
  { path: "/stats", label: "Stats", icon: BarChart3 },
  { path: "/players", label: "Spieler", icon: Users }
];

const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, "");

const emptySlots: MatchSlot[] = [
  { playerId: "", team: "A", role: "defense" },
  { playerId: "", team: "A", role: "attack" },
  { playerId: "", team: "B", role: "defense" },
  { playerId: "", team: "B", role: "attack" }
];

export default function App() {
  const [path, setPath] = useState<RoutePath>(readRoute());
  const [data, setData] = useState<KickerData>({ players: [], matches: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState(() => window.sessionStorage.getItem("kicker-group-code") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await repository.load());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onPopState = () => setPath(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("kicker-group-code", groupCode);
  }, [groupCode]);

  const rankings = useMemo(() => calculateRankings(data.players, data.matches), [data]);
  const activePlayers = useMemo(() => data.players.filter((player) => player.active), [data.players]);
  const playersById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players]);

  function navigate(nextPath: RoutePath) {
    window.history.pushState({}, "", `${basePath}${nextPath}`);
    setPath(nextPath);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function mutate(action: () => Promise<void>) {
    if (!groupCode.trim()) {
      setError("Bitte zuerst den Gruppen-Code eingeben.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Menü öffnen">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <button className="brand" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark">KR</span>
          <span>
            <strong>Kicker Ranking</strong>
            <small>Uni-Liga</small>
          </span>
        </button>

        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Hauptmenü">
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <button key={route.path} className={path === route.path ? "nav-item active" : "nav-item"} type="button" onClick={() => navigate(route.path)}>
                <Icon size={18} />
                <span>{route.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="access-panel">
          <span className={repository.source === "supabase" ? "source-badge live" : "source-badge"}>{repository.source === "supabase" ? "Live" : "Demo"}</span>
          <label className="code-input">
            <KeyRound size={16} />
            <input value={groupCode} onChange={(event) => setGroupCode(event.target.value)} type="password" placeholder="Gruppen-Code" aria-label="Gruppen-Code" />
          </label>
          <button className="icon-button" type="button" onClick={() => void reload()} aria-label="Daten neu laden" disabled={loading || busy}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <main className="page">
        {error ? <div className="alert">{error}</div> : null}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {path === "/" ? <Dashboard data={data} rankings={rankings} playersById={playersById} navigate={navigate} /> : null}
            {path === "/matches" ? (
              <MatchesPage
                players={activePlayers}
                matches={data.matches}
                rankings={rankings}
                playersById={playersById}
                busy={busy}
                onSave={(input) => mutate(() => repository.upsertMatch(input, groupCode))}
                onDelete={(matchId) => mutate(() => repository.deleteMatch(matchId, groupCode))}
              />
            ) : null}
            {path === "/rankings" ? <RankingsPage rankings={rankings} /> : null}
            {path === "/stats" ? <StatsPage rankings={rankings} matches={data.matches} playersById={playersById} /> : null}
            {path === "/players" ? (
              <PlayersPage
                players={data.players}
                busy={busy}
                onSave={(input) => mutate(() => repository.upsertPlayer(input, groupCode))}
                onDeactivate={(player) => mutate(() => repository.upsertPlayer({ id: player.id, displayName: player.displayName, active: false }, groupCode))}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function Dashboard({
  data,
  rankings,
  playersById,
  navigate
}: {
  data: KickerData;
  rankings: ReturnType<typeof calculateRankings>;
  playersById: Map<string, Player>;
  navigate: (path: RoutePath) => void;
}) {
  const leader = rankings.players[0];
  const bestTeam = rankings.teams[0];
  const recentMatches = rankings.recentMatches.slice(0, 4);
  const averageGoals =
    data.matches.length > 0
      ? data.matches.reduce((sum, match) => sum + match.teamAScore + match.teamBScore, 0) / data.matches.length
      : 0;

  return (
    <div className="page-grid">
      <section className="overview-band">
        <div className="overview-copy">
          <span className="eyebrow">2v2 Tischkicker</span>
          <h1>Ranking, Rollen und Form auf einen Blick.</h1>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => navigate("/matches")}>
              <Plus size={18} /> Spiel eintragen
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate("/rankings")}>
              <Trophy size={18} /> Rankings
            </button>
          </div>
        </div>
        <img className="field-visual" src={`${import.meta.env.BASE_URL}foosball-field.svg`} alt="Tischkicker Spielfeld" />
      </section>

      <section className="metrics-grid" aria-label="Kurzüberblick">
        <Metric icon={Medal} label="Top-Spieler" value={leader ? leader.player.displayName : "Noch offen"} detail={leader ? `${formatRating(leader.overallRating)} Elo` : "Keine Spiele"} />
        <Metric
          icon={Swords}
          label="Bestes Team"
          value={bestTeam ? `${bestTeam.defensePlayer.displayName} + ${bestTeam.attackPlayer.displayName}` : "Noch offen"}
          detail={bestTeam ? `${formatRating(bestTeam.rating)} Team-Elo` : "Keine Paarung"}
        />
        <Metric icon={CalendarDays} label="Spiele" value={String(data.matches.length)} detail={`${data.players.filter((player) => player.active).length} aktive Spieler`} />
        <Metric icon={Goal} label="Ø Tore/Spiel" value={averageGoals.toFixed(1)} detail="Beide Teams zusammen" />
      </section>

      <section className="two-column">
        <div className="panel">
          <PanelTitle icon={Trophy} title="Top 5 Spieler" />
          <StandingList standings={rankings.players.slice(0, 5)} />
        </div>
        <div className="panel">
          <PanelTitle icon={CalendarDays} title="Letzte Spiele" />
          <MatchList matches={recentMatches} playersById={playersById} compact />
        </div>
      </section>
    </div>
  );
}

function MatchesPage({
  players,
  matches,
  rankings,
  playersById,
  busy,
  onSave,
  onDelete
}: {
  players: Player[];
  matches: MatchRecord[];
  rankings: ReturnType<typeof calculateRankings>;
  playersById: Map<string, Player>;
  busy: boolean;
  onSave: (input: MatchInput) => Promise<void>;
  onDelete: (matchId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<MatchRecord | null>(null);

  const sortedMatches = useMemo(
    () =>
      [...matches]
        .filter((match) => !match.isDeleted)
        .sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime()),
    [matches]
  );

  return (
    <div className="page-grid">
      <PageHeader icon={ListPlus} eyebrow="Spiele" title="Matches eintragen und Historie pflegen." />
      <MatchForm key={editing?.id ?? "new-match"} players={players} editing={editing} busy={busy} onSave={onSave} onCancel={() => setEditing(null)} />

      <section className="panel">
        <PanelTitle icon={CalendarDays} title="Match-Historie" />
        <div className="match-history">
          {sortedMatches.length === 0 ? <EmptyState text="Noch keine Spiele vorhanden." /> : null}
          {sortedMatches.map((match) => (
            <article className="match-row" key={match.id}>
              <MatchSummary match={match} playersById={playersById} />
              <div className="row-actions">
                <button className="icon-button" type="button" onClick={() => setEditing(match)} aria-label="Spiel bearbeiten">
                  <Edit3 size={17} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm("Dieses Spiel löschen?")) {
                      void onDelete(match.id);
                    }
                  }}
                  aria-label="Spiel löschen"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelTitle icon={Medal} title="Aktuelle Form" />
        <StandingList standings={rankings.players.filter((standing) => standing.games > 0).slice(0, 8)} showForm />
      </section>
    </div>
  );
}

function MatchForm({
  players,
  editing,
  busy,
  onSave,
  onCancel
}: {
  players: Player[];
  editing: MatchRecord | null;
  busy: boolean;
  onSave: (input: MatchInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MatchInput>(() => toMatchDraft(editing));
  const [errors, setErrors] = useState<string[]>([]);

  function updateSlot(team: TeamKey, role: Role, playerId: string) {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => (slot.team === team && slot.role === role ? { ...slot, playerId } : slot))
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: MatchInput = {
      ...draft,
      playedAt: new Date(draft.playedAt).toISOString(),
      teamAScore: Number(draft.teamAScore),
      teamBScore: Number(draft.teamBScore)
    };
    const nextErrors = validateMatchInput(input, players);
    setErrors(nextErrors);

    if (nextErrors.length === 0) {
      await onSave(input);
      setDraft(toMatchDraft(null));
      onCancel();
    }
  }

  return (
    <section className="panel">
      <PanelTitle icon={editing ? Edit3 : Plus} title={editing ? "Spiel bearbeiten" : "Neues Spiel"} />
      <form className="match-form" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>
            Datum
            <input type="datetime-local" value={draft.playedAt} onChange={(event) => setDraft({ ...draft, playedAt: event.target.value })} />
          </label>
          <label>
            Team A Tore
            <input min={0} type="number" value={draft.teamAScore} onChange={(event) => setDraft({ ...draft, teamAScore: Number(event.target.value) })} />
          </label>
          <label>
            Team B Tore
            <input min={0} type="number" value={draft.teamBScore} onChange={(event) => setDraft({ ...draft, teamBScore: Number(event.target.value) })} />
          </label>
          <label>
            Notiz
            <input value={draft.note ?? ""} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={120} />
          </label>
        </div>

        <div className="teams-editor">
          <TeamEditor title="Team A" team="A" draft={draft} players={players} onChange={updateSlot} />
          <TeamEditor title="Team B" team="B" draft={draft} players={players} onChange={updateSlot} />
        </div>

        {errors.length > 0 ? (
          <ul className="form-errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}

        <div className="form-actions">
          {editing ? (
            <button className="secondary-button" type="button" onClick={onCancel}>
              <X size={18} /> Abbrechen
            </button>
          ) : null}
          <button className="primary-button" type="submit" disabled={busy || players.length < 4}>
            <Save size={18} /> Speichern
          </button>
        </div>
      </form>
    </section>
  );
}

function TeamEditor({
  title,
  team,
  draft,
  players,
  onChange
}: {
  title: string;
  team: TeamKey;
  draft: MatchInput;
  players: Player[];
  onChange: (team: TeamKey, role: Role, playerId: string) => void;
}) {
  return (
    <fieldset className="team-editor">
      <legend>{title}</legend>
      <RoleSelect team={team} role="defense" label="Abwehr/Tor" draft={draft} players={players} onChange={onChange} />
      <RoleSelect team={team} role="attack" label="Angriff" draft={draft} players={players} onChange={onChange} />
    </fieldset>
  );
}

function RoleSelect({
  team,
  role,
  label,
  draft,
  players,
  onChange
}: {
  team: TeamKey;
  role: Role;
  label: string;
  draft: MatchInput;
  players: Player[];
  onChange: (team: TeamKey, role: Role, playerId: string) => void;
}) {
  const value = draft.slots.find((slot) => slot.team === team && slot.role === role)?.playerId ?? "";
  const selectedElsewhere = new Set(draft.slots.filter((slot) => !(slot.team === team && slot.role === role)).map((slot) => slot.playerId).filter(Boolean));

  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(team, role, event.target.value)}>
        <option value="">Auswählen</option>
        {players.map((player) => (
          <option key={player.id} value={player.id} disabled={selectedElsewhere.has(player.id)}>
            {player.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function RankingsPage({ rankings }: { rankings: ReturnType<typeof calculateRankings> }) {
  const [tab, setTab] = useState<RankingTab>("overall");

  const attack = [...rankings.players].sort((left, right) => right.attackRating - left.attackRating);
  const defense = [...rankings.players].sort((left, right) => right.defenseRating - left.defenseRating);

  return (
    <div className="page-grid">
      <PageHeader icon={Trophy} eyebrow="Rankings" title="Spieler, Rollen und feste Teams." />
      <div className="tabs" role="tablist" aria-label="Ranking Ansicht">
        <TabButton active={tab === "overall"} onClick={() => setTab("overall")} icon={Medal} label="Gesamt" />
        <TabButton active={tab === "attack"} onClick={() => setTab("attack")} icon={Goal} label="Angriff" />
        <TabButton active={tab === "defense"} onClick={() => setTab("defense")} icon={Shield} label="Abwehr" />
        <TabButton active={tab === "teams"} onClick={() => setTab("teams")} icon={Swords} label="Teams" />
      </div>

      <section className="panel">
        {tab === "overall" ? <PlayerRankingTable standings={rankings.players} mode="overall" /> : null}
        {tab === "attack" ? <PlayerRankingTable standings={attack} mode="attack" /> : null}
        {tab === "defense" ? <PlayerRankingTable standings={defense} mode="defense" /> : null}
        {tab === "teams" ? <TeamRankingTable teams={rankings.teams} /> : null}
      </section>
    </div>
  );
}

function StatsPage({
  rankings,
  matches,
  playersById
}: {
  rankings: ReturnType<typeof calculateRankings>;
  matches: MatchRecord[];
  playersById: Map<string, Player>;
}) {
  const withGames = rankings.players.filter((standing) => standing.games > 0);
  const winRate = [...withGames].sort((left, right) => winRateValue(right) - winRateValue(left) || right.games - left.games).slice(0, 8);
  const mostGames = [...withGames].sort((left, right) => right.games - left.games).slice(0, 8);
  const form = [...withGames].sort((left, right) => formScore(right.lastResults) - formScore(left.lastResults)).slice(0, 8);
  const offense = [...withGames].sort((left, right) => right.attackGoalsFor - left.attackGoalsFor).slice(0, 8);
  const defense = [...withGames]
    .filter((standing) => standing.defenseGames > 0)
    .sort((left, right) => defenseConcededAverage(left) - defenseConcededAverage(right))
    .slice(0, 8);

  return (
    <div className="page-grid">
      <PageHeader icon={BarChart3} eyebrow="Statistiken" title="Leaderboards jenseits vom Elo-Ranking." />
      <section className="stats-grid">
        <Leaderboard title="Beste Winrate" icon={Trophy} rows={winRate.map((standing) => [standing.player.displayName, formatPercent(winRateValue(standing)), `${standing.games} Spiele`])} />
        <Leaderboard title="Formkurve" icon={Medal} rows={form.map((standing) => [standing.player.displayName, `${formScore(standing.lastResults).toFixed(1)} Punkte`, resultDots(standing.lastResults)])} />
        <Leaderboard title="Meiste Spiele" icon={CalendarDays} rows={mostGames.map((standing) => [standing.player.displayName, `${standing.games}`, `${standing.wins} Siege`])} />
        <Leaderboard title="Angriffs-Tore" icon={Goal} rows={offense.map((standing) => [standing.player.displayName, `${standing.attackGoalsFor}`, `${standing.attackGames}x Angriff`])} />
        <Leaderboard title="Beste Abwehrquote" icon={Shield} rows={defense.map((standing) => [standing.player.displayName, defenseConcededAverage(standing).toFixed(1), `${standing.defenseGames}x Abwehr`])} />
        <Leaderboard
          title="Höchste Siege"
          icon={Swords}
          rows={rankings.biggestWins.map((match) => [formatMatchTeams(match, playersById), `${match.teamAScore}:${match.teamBScore}`, formatDate(match.playedAt)])}
        />
      </section>

      <section className="panel">
        <PanelTitle icon={CalendarDays} title="Alle Spiele" />
        <MatchList matches={matches.filter((match) => !match.isDeleted)} playersById={playersById} />
      </section>
    </div>
  );
}

function PlayersPage({
  players,
  busy,
  onSave,
  onDeactivate
}: {
  players: Player[];
  busy: boolean;
  onSave: (input: { id?: string; displayName: string; active?: boolean }) => Promise<void>;
  onDeactivate: (player: Player) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Player | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setName(editing?.displayName ?? "");
    setErrors([]);
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateDisplayName(name);
    const duplicate = players.some((player) => player.id !== editing?.id && player.displayName.trim().toLowerCase() === name.trim().toLowerCase());
    if (duplicate) {
      nextErrors.push("Dieser Name existiert bereits.");
    }
    setErrors(nextErrors);

    if (nextErrors.length === 0) {
      await onSave({ id: editing?.id, displayName: name.trim(), active: editing?.active ?? true });
      setEditing(null);
      setName("");
    }
  }

  return (
    <div className="page-grid">
      <PageHeader icon={Users} eyebrow="Spieler" title="Roster verwalten." />
      <section className="panel">
        <PanelTitle icon={editing ? Edit3 : Plus} title={editing ? "Spieler bearbeiten" : "Spieler anlegen"} />
        <form className="player-form" onSubmit={(event) => void submit(event)}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </label>
          <div className="form-actions">
            {editing ? (
              <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
                <X size={18} /> Abbrechen
              </button>
            ) : null}
            <button className="primary-button" type="submit" disabled={busy}>
              <Save size={18} /> Speichern
            </button>
          </div>
        </form>
        {errors.length > 0 ? (
          <ul className="form-errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <PanelTitle icon={Users} title="Roster" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Seit</th>
                <th className="align-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.displayName}</td>
                  <td>{player.active ? "Aktiv" : "Inaktiv"}</td>
                  <td>{formatDate(player.createdAt)}</td>
                  <td className="align-right action-cell">
                    <button className="icon-button" type="button" onClick={() => setEditing(player)} aria-label={`${player.displayName} bearbeiten`}>
                      <Edit3 size={17} />
                    </button>
                    {player.active ? (
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => {
                          if (window.confirm(`${player.displayName} deaktivieren? Historische Spiele bleiben erhalten.`)) {
                            void onDeactivate(player);
                          }
                        }}
                        aria-label={`${player.displayName} deaktivieren`}
                      >
                        <Trash2 size={17} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlayerRankingTable({ standings, mode }: { standings: PlayerStanding[]; mode: "overall" | "attack" | "defense" }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Spieler</th>
            <th>Rating</th>
            <th>Spiele</th>
            <th>Winrate</th>
            <th>Tore</th>
            <th>Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const rating = mode === "attack" ? standing.attackRating : mode === "defense" ? standing.defenseRating : standing.overallRating;
            const roleGames = mode === "attack" ? standing.attackGames : mode === "defense" ? standing.defenseGames : standing.games;
            return (
              <tr key={standing.player.id}>
                <td>{index + 1}</td>
                <td>
                  <strong>{standing.player.displayName}</strong>
                  {standing.games < 10 ? <span className="muted-inline">provisorisch</span> : null}
                </td>
                <td>{formatRating(rating)}</td>
                <td>{roleGames}</td>
                <td>{formatPercent(winRateValue(standing))}</td>
                <td>{standing.goalsFor}:{standing.goalsAgainst}</td>
                <td>{resultDots(standing.lastResults)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamRankingTable({ teams }: { teams: TeamStanding[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Rating</th>
            <th>Spiele</th>
            <th>Winrate</th>
            <th>Torverhältnis</th>
            <th>Form</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, index) => (
            <tr key={team.key}>
              <td>{index + 1}</td>
              <td>
                <strong>{team.defensePlayer.displayName}</strong>
                <span className="role-pill">Abwehr</span>
                <strong>{team.attackPlayer.displayName}</strong>
                <span className="role-pill attack">Angriff</span>
              </td>
              <td>{formatRating(team.rating)}</td>
              <td>{team.games}</td>
              <td>{formatPercent(team.games ? team.wins / team.games : 0)}</td>
              <td>{team.goalsFor}:{team.goalsAgainst}</td>
              <td>{resultDots(team.lastResults)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingList({ standings, showForm = false }: { standings: PlayerStanding[]; showForm?: boolean }) {
  if (standings.length === 0) {
    return <EmptyState text="Noch keine Wertung vorhanden." />;
  }

  return (
    <ol className="standing-list">
      {standings.map((standing) => (
        <li key={standing.player.id}>
          <span>
            <strong>{standing.player.displayName}</strong>
            <small>{standing.games} Spiele · {formatPercent(winRateValue(standing))}</small>
          </span>
          <span className="list-score">{showForm ? resultDots(standing.lastResults) : formatRating(standing.overallRating)}</span>
        </li>
      ))}
    </ol>
  );
}

function MatchList({ matches, playersById, compact = false }: { matches: MatchRecord[]; playersById: Map<string, Player>; compact?: boolean }) {
  const visible = [...matches]
    .filter((match) => !match.isDeleted)
    .sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime());

  if (visible.length === 0) {
    return <EmptyState text="Noch keine Spiele vorhanden." />;
  }

  return (
    <div className={compact ? "match-list compact" : "match-list"}>
      {visible.map((match) => (
        <MatchSummary key={match.id} match={match} playersById={playersById} />
      ))}
    </div>
  );
}

function MatchSummary({ match, playersById }: { match: MatchRecord; playersById: Map<string, Player> }) {
  const teamA = teamLabel(match, "A", playersById);
  const teamB = teamLabel(match, "B", playersById);
  const winner = match.teamAScore === match.teamBScore ? "draw" : match.teamAScore > match.teamBScore ? "A" : "B";

  return (
    <div className="match-summary">
      <div>
        <time>{formatDate(match.playedAt)}</time>
        {match.note ? <small>{match.note}</small> : null}
      </div>
      <div className={winner === "A" ? "team-line winner" : "team-line"}>
        <span>{teamA}</span>
        <strong>{match.teamAScore}</strong>
      </div>
      <div className={winner === "B" ? "team-line winner" : "team-line"}>
        <span>{teamB}</span>
        <strong>{match.teamBScore}</strong>
      </div>
    </div>
  );
}

function Leaderboard({ title, icon: Icon, rows }: { title: string; icon: typeof Trophy; rows: string[][] }) {
  return (
    <section className="panel">
      <PanelTitle icon={Icon} title={title} />
      {rows.length === 0 ? (
        <EmptyState text="Noch keine Daten." />
      ) : (
        <ol className="leaderboard">
          {rows.map((row, index) => (
            <li key={`${title}-${row.join("-")}`}>
              <span className="rank-number">{index + 1}</span>
              <strong>{row[0]}</strong>
              <span>{row[1]}</span>
              <small>{row[2]}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Trophy; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PageHeader({ icon: Icon, eyebrow, title }: { icon: typeof Trophy; eyebrow: string; title: string }) {
  return (
    <section className="page-header">
      <Icon size={22} />
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
    </section>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: typeof Trophy; title: string }) {
  return (
    <div className="panel-title">
      <Icon size={19} />
      <h2>{title}</h2>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Trophy; label: string }) {
  return (
    <button className={active ? "tab active" : "tab"} type="button" onClick={onClick}>
      <Icon size={17} />
      {label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function LoadingState() {
  return (
    <div className="loading-state">
      <RefreshCw size={24} />
      <span>Lade Ranking...</span>
    </div>
  );
}

function toMatchDraft(match: MatchRecord | null): MatchInput {
  if (!match) {
    return {
      playedAt: toDateTimeLocalValue(new Date().toISOString()),
      teamAScore: 10,
      teamBScore: 0,
      note: "",
      slots: emptySlots.map((slot) => ({ ...slot }))
    };
  }

  return {
    id: match.id,
    playedAt: toDateTimeLocalValue(match.playedAt),
    teamAScore: match.teamAScore,
    teamBScore: match.teamBScore,
    note: match.note ?? "",
    slots: emptySlots.map((emptySlot) => match.slots.find((slot) => slot.team === emptySlot.team && slot.role === emptySlot.role) ?? { ...emptySlot })
  };
}

function readRoute(): RoutePath {
  const pathname = window.location.pathname;
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const current = withoutBase as RoutePath;
  return routes.some((route) => route.path === current) ? current : "/";
}

function teamLabel(match: MatchRecord, team: TeamKey, playersById: Map<string, Player>): string {
  const defense = match.slots.find((slot) => slot.team === team && slot.role === "defense");
  const attack = match.slots.find((slot) => slot.team === team && slot.role === "attack");
  const defenseName = defense ? playersById.get(defense.playerId)?.displayName ?? "Unbekannt" : "Unbekannt";
  const attackName = attack ? playersById.get(attack.playerId)?.displayName ?? "Unbekannt" : "Unbekannt";
  return `${defenseName} / ${attackName}`;
}

function formatMatchTeams(match: MatchRecord, playersById: Map<string, Player>): string {
  return `${teamLabel(match, "A", playersById)} vs. ${teamLabel(match, "B", playersById)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatRating(value: number): string {
  return Math.round(value).toString();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function winRateValue(standing: PlayerStanding): number {
  return standing.games ? standing.wins / standing.games : 0;
}

function defenseConcededAverage(standing: PlayerStanding): number {
  return standing.defenseGames ? standing.defenseGoalsAgainst / standing.defenseGames : Number.POSITIVE_INFINITY;
}

function formScore(results: MatchResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  return (
    results.reduce((score, result) => {
      if (result === "win") {
        return score + 3;
      }
      if (result === "draw") {
        return score + 1;
      }
      return score;
    }, 0) / results.length
  );
}

function resultDots(results: MatchResult[]): string {
  if (results.length === 0) {
    return "–";
  }

  return results
    .map((result) => {
      if (result === "win") {
        return "S";
      }
      if (result === "draw") {
        return "U";
      }
      return "N";
    })
    .join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler.";
}
