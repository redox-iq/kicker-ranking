import {
  BarChart3,
  CalendarDays,
  Edit3,
  Goal,
  Home,
  KeyRound,
  ListPlus,
  LogOut,
  Medal,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Swords,
  Trash2,
  Trophy,
  Users,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { clearTrustedDevice, formatTrustedDeviceExpiry, readTrustedDevice, saveTrustedDevice } from "./lib/deviceAccess";
import { calculateRankings } from "./lib/ranking";
import { repository } from "./lib/repository";
import { validateDisplayName, validateMatchInput } from "./lib/validation";
import type { KickerData, MatchInput, MatchRecord, MatchResult, MatchSlot, Player, PlayerStanding, Role, TeamKey, TeamStanding } from "./types";

type RoutePath = "/" | "/matches.html" | "/rankings.html" | "/stats.html" | "/players.html";
type RankingTab = "overall" | "attack" | "defense" | "teams";
type ConnectionStatus = "checking" | "live" | "offline";

const routes: Array<{ path: RoutePath; label: string; icon: typeof Home }> = [
  { path: "/", label: "Übersicht", icon: Home },
  { path: "/matches.html", label: "Spiele", icon: ListPlus },
  { path: "/rankings.html", label: "Rankings", icon: Trophy },
  { path: "/stats.html", label: "Stats", icon: BarChart3 },
  { path: "/players.html", label: "Spieler", icon: Users }
];

const legacyRoutes: Record<string, RoutePath> = {
  "/matches": "/matches.html",
  "/rankings": "/rankings.html",
  "/stats": "/stats.html",
  "/players": "/players.html"
};

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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(repository.source === "supabase" ? "checking" : "offline");
  const [groupCode, setGroupCode] = useState(() => window.sessionStorage.getItem("kicker-group-code") ?? "");
  const [trustedDevice, setTrustedDevice] = useState(() => readTrustedDevice(window.localStorage));
  const [rememberDevice, setRememberDevice] = useState(repository.source === "supabase");
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (repository.source === "supabase") {
      setConnectionStatus("checking");
    }
    try {
      setData(await repository.load());
      setConnectionStatus(repository.source === "supabase" ? "live" : "offline");
    } catch (err) {
      setConnectionStatus("offline");
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const checkConnection = useCallback(async () => {
    if (repository.source !== "supabase") {
      setConnectionStatus("offline");
      return;
    }

    setConnectionStatus("checking");
    try {
      await repository.checkConnection();
      setConnectionStatus("live");
    } catch {
      setConnectionStatus("offline");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onPopState = () => {
      setPath(readRoute());
      void checkConnection();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [checkConnection]);

  useEffect(() => {
    window.sessionStorage.setItem("kicker-group-code", groupCode);
  }, [groupCode]);

  const rankings = useMemo(() => calculateRankings(data.players, data.matches), [data]);
  const activePlayers = useMemo(() => data.players.filter((player) => player.active), [data.players]);
  const playersById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players]);

  function navigate(nextPath: RoutePath) {
    const routeChanged = nextPath !== path;
    window.history.pushState({}, "", `${basePath}${nextPath}`);
    setPath(nextPath);
    if (routeChanged) {
      void checkConnection();
    }
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function mutate(action: (credential: string) => Promise<void>): Promise<boolean> {
    const enteredCode = groupCode.trim();
    if (!trustedDevice && !enteredCode) {
      setError("Bitte zuerst den Gruppen-Code eingeben.");
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      let credential = trustedDevice?.token ?? enteredCode;

      if (!trustedDevice && rememberDevice && repository.source === "supabase") {
        const registration = await repository.registerTrustedDevice(enteredCode);
        saveTrustedDevice(window.localStorage, registration);
        setTrustedDevice(registration);
        setGroupCode("");
        credential = registration.token;
      }

      await action(credential);
      await reload();
      return true;
    } catch (err) {
      const message = errorMessage(err);
      if (trustedDevice && message.toLowerCase().includes("gerätefreigabe")) {
        clearTrustedDevice(window.localStorage);
        setTrustedDevice(null);
        setError(`${message} Bitte den Gruppen-Code erneut eingeben.`);
      } else {
        setError(message);
      }
      await checkConnection();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function forgetDevice() {
    const current = trustedDevice;
    if (!current) {
      return;
    }

    clearTrustedDevice(window.localStorage);
    setTrustedDevice(null);
    setGroupCode("");
    setBusy(true);
    setError(null);
    try {
      await repository.revokeTrustedDevice(current.token);
    } catch (err) {
      setError(`Die Freigabe wurde auf diesem Gerät entfernt. Supabase meldet: ${errorMessage(err)}`);
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
          <span className={`source-badge ${connectionStatus}`} role="status" aria-live="polite">
            {connectionStatus === "checking" ? "Prüfe…" : connectionStatus === "live" ? "Live" : "Offline"}
          </span>
          {trustedDevice ? (
            <div className="trusted-device" title={`Dieses Gerät ist bis ${formatTrustedDeviceExpiry(trustedDevice.expiresAt)} freigeschaltet.`}>
              <ShieldCheck size={16} />
              <span>Gerät bis {formatTrustedDeviceExpiry(trustedDevice.expiresAt)}</span>
              <button type="button" onClick={() => void forgetDevice()} disabled={busy} aria-label="Gerätefreigabe entfernen" title="Gerät vergessen">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <>
              <label className="code-input">
                <KeyRound size={16} />
                <input value={groupCode} onChange={(event) => setGroupCode(event.target.value)} type="password" placeholder="Gruppen-Code" aria-label="Gruppen-Code" />
              </label>
              {repository.source === "supabase" ? (
                <label className="remember-device" title="Nach der nächsten erfolgreichen Änderung bleibt dieses Gerät 30 Tage freigeschaltet.">
                  <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
                  <span>30 Tage merken</span>
                </label>
              ) : null}
            </>
          )}
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
            {path === "/matches.html" ? (
              <MatchesPage
                players={activePlayers}
                matches={data.matches}
                rankings={rankings}
                playersById={playersById}
                busy={busy}
                onSave={(input) => mutate((credential) => repository.upsertMatch(input, credential))}
                onDelete={(matchId) => mutate((credential) => repository.deleteMatch(matchId, credential))}
              />
            ) : null}
            {path === "/rankings.html" ? <RankingsPage rankings={rankings} /> : null}
            {path === "/stats.html" ? <StatsPage rankings={rankings} matches={data.matches} playersById={playersById} /> : null}
            {path === "/players.html" ? (
              <PlayersPage
                players={data.players}
                busy={busy}
                onSave={(input) => mutate((credential) => repository.upsertPlayer(input, credential))}
                onDeactivate={(player) => mutate((credential) => repository.upsertPlayer({ id: player.id, displayName: player.displayName, active: false }, credential))}
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
            <button className="primary-button" type="button" onClick={() => navigate("/matches.html")}>
              <Plus size={18} /> Spiel eintragen
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate("/rankings.html")}>
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
  onSave: (input: MatchInput) => Promise<boolean>;
  onDelete: (matchId: string) => Promise<boolean>;
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
  onSave: (input: MatchInput) => Promise<boolean>;
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
      const saved = await onSave(input);
      if (saved) {
        setDraft(toMatchDraft(null));
        onCancel();
      }
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
            <input min={0} type="number" value…5658 tokens truncated…atch.slots.find((slot) => slot.team === emptySlot.team && slot.role === emptySlot.role) ?? { ...emptySlot })
  };
}

function readRoute(): RoutePath {
  const pathname = window.location.pathname;
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const normalized = withoutBase.length > 1 ? withoutBase.replace(/\/$/, "") : withoutBase;
  const legacyRoute = legacyRoutes[normalized];
  if (legacyRoute) {
    return legacyRoute;
  }
  const current = normalized as RoutePath;
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
