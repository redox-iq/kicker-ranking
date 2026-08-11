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
  { path: "/", label: "√úbersicht", icon: Home },
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
      if (trustedDevice && message.toLowerCase().includes("ger√§tefreigabe")) {
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
      setError(`Die Freigabe wurde auf diesem Ger√§t entfernt. Supabase meldet: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Men√º √∂ffnen">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <button className="brand" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark">KR</span>
          <span>
            <strong>Kicker Ranking</strong>
            <small>Uni-Liga</small>
          </span>
        </button>

        <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Hauptmen√º">
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
            {connectionStatus === "checking" ? "Pr√ºfe‚Ä¶" : connectionStatus === "live" ? "Live" : "Offline"}
          </span>
          {trustedDevice ? (
            <div className="trusted-device" title={`Dieses Ger√§t ist bis ${formatTrustedDeviceExpiry(trustedDevice.expiresAt)} freigeschaltet.`}>
              <ShieldCheck size={16} />
              <span>Ger√§t bis {formatTrustedDeviceExpiry(trustedDevice.expiresAt)}</span>
              <button type="button" onClick={() => void forgetDevice()} disabled={busy} aria-label="Ger√§tefreigabe entfernen" title="Ger√§t vergessen">
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
                <label className="remember-device" title="Nach der n√§chsten erfolgreichen √Ñnderung bleibt dieses Ger√§t 30 Tage freigeschaltet.">
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

      <section className="metrics-grid" aria-label="Kurz√ºberblick">
        <Metric icon={Medal} label="Top-Spieler" value={leader ? leader.player.displayName : "Noch offen"} detail={leader ? `${formatRating(leader.overallRating)} Elo` : "Keine Spiele"} />
        <Metric
          icon={Swords}
          label="Bestes Team"
          value={bestTeam ? `${bestTeam.defensePlayer.displayName} + ${bestTeam.attackPlayer.displayName}` : "Noch offen"}
          detail={bestTeam ? `${formatRating(bestTeam.rating)} Team-Elo` : "Keine Paarung"}
        />
        <Metric icon={CalendarDays} label="Spiele" value={String(data.matches.length)} detail={`${data.players.filter((player) => player.active).length} aktive Spieler`} />
        <Metric icon={Goal} label="√ò Tore/Spiel" value={averageGoals.toFixed(1)} detail="Beide Teams zusammen" />
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
                  onClicm¥◊_-¢Gß≤⁄Óù∆≠y’π–†®§∞ÅçΩ’π–°ë•Õ—•πç–Å¡±ÖÂï…}•ê§(ÄÅ•π—ºÅŸ}Õ±Ω—}çΩ’π–∞ÅŸ}ë•Õ—•πç—}¡±ÖÂï…Ã(ÄÅô…Ω¥ÅÕ±Ω—ÃÏ((ÄÅ•òÅŸ}Õ±Ω—}çΩ’π–Ä¯Ä–ÅΩ»ÅŸ}ë•Õ—•πç—}¡±ÖÂï…ÃÄ¯Ä–Å—°ï∏(ÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏ÄùY•ï»Å’π—ï…Õç°•ïë±•ç°îÅM¡•ï±ï»ÅÕ•πêÅï…ôΩ…ëï…±•ç†∏úÏ(ÄÅïπêÅ•òÏ((ÄÅ›•—†ÅÕ±Ω—ÃÅÖÃÄ†(ÄÄÄÅÕï±ïç–Ä®(ÄÄÄÅô…Ω¥Å©ÕΩπâ}—Ω}…ïçΩ…ëÕï–°¡}Õ±Ω—Ã§ÅÖÃÅÕ±Ω–°¡±ÖÂï…}•êÅ’’•ê∞Å—ïÖ¥Å—ï·–∞Å…Ω±îÅ—ï·–§(ÄÄ§∞(ÄÅï·¡ïç—ïêÅÖÃÄ†(ÄÄÄÅÕï±ïç–Å—ïÖ¥∞Å…Ω±î(ÄÄÄÅô…Ω¥Ä°ŸÖ±’ïÃÄ†ùú∞ÄùëïôïπÕîú§∞Ä†ùú∞ÄùÖ——Öç¨ú§∞Ä†ùú∞ÄùëïôïπÕîú§∞Ä†ùú∞ÄùÖ——Öç¨ú§§ÅÖÃÅï·¡ïç—ïê°—ïÖ¥∞Å…Ω±î§(ÄÄ§(ÄÅÕï±ïç–ÅçΩ’π–†®§(ÄÅ•π—ºÅŸ}•πŸÖ±•ë}Õ±Ω—Ã(ÄÅô…Ω¥Åï·¡ïç—ïê(ÄÅ±ïô–Å©Ω•∏ÅÕ±Ω—ÃÅΩ∏ÅÕ±Ω—Ãπ—ïÖ¥ÄÙÅï·¡ïç—ïêπ—ïÖ¥ÅÖπêÅÕ±Ω—Ãπ…Ω±îÄÙÅï·¡ïç—ïêπ…Ω±î(ÄÅ›°ï…îÅÕ±Ω—Ãπ¡±ÖÂï…}•êÅ•ÃÅπ’±∞Ï((ÄÅ•òÅŸ}•πŸÖ±•ë}Õ±Ω—ÃÄ¯Ä¿Å—°ï∏(ÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏Äù)ïëïÃÅQïÖ¥Åâ…Ö’ç°–Åπù…•ôòÅ’πêÅâ›ï°»∏úÏ(ÄÅïπêÅ•òÏ((ÄÅ›•—†ÅÕ±Ω—ÃÅÖÃÄ†(ÄÄÄÅÕï±ïç–Ä®(ÄÄÄÅô…Ω¥Å©ÕΩπâ}—Ω}…ïçΩ…ëÕï–°¡}Õ±Ω—Ã§ÅÖÃÅÕ±Ω–°¡±ÖÂï…}•êÅ’’•ê∞Å—ïÖ¥Å—ï·–∞Å…Ω±îÅ—ï·–§(ÄÄ§(ÄÅÕï±ïç–ÅçΩ’π–†®§(ÄÅ•π—ºÅŸ}•πÖç—•Ÿï}¡±ÖÂï…Ã(ÄÅô…Ω¥ÅÕ±Ω—Ã(ÄÅ±ïô–Å©Ω•∏Å¡’â±•åπ¡±ÖÂï…ÃÅ¡±ÖÂï»ÅΩ∏Å¡±ÖÂï»π•êÄÙÅÕ±Ω—Ãπ¡±ÖÂï…}•êÅÖπêÅ¡±ÖÂï»πÖç—•ŸîÄÙÅ—…’î(ÄÅ›°ï…îÅ¡±ÖÂï»π•êÅ•ÃÅπ’±∞Ï((ÄÅ•òÅŸ}•πÖç—•Ÿï}¡±ÖÂï…ÃÄ¯Ä¿Å—°ï∏(ÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏Äù±±îÅM¡•ï±ï»Åµ’ïÕÕï∏ÅÖ≠—•ÿÅÕï•∏∏úÏ(ÄÅïπêÅ•òÏ)ïπêÏ(êêÏ()ç…ïÖ—îÅΩ»Å…ï¡±ÖçîÅô’πç—•Ω∏Å¡’â±•åπ’¡Õï…—}¡±ÖÂï»†(ÄÅ¡}ù…Ω’¡}çΩëîÅ—ï·–∞(ÄÅ¡}¡±ÖÂï…}•êÅ’’•ê∞(ÄÅ¡}ë•Õ¡±ÖÂ}πÖµîÅ—ï·–∞(ÄÅ¡}Öç—•ŸîÅâΩΩ±ïÖ∏ÅëïôÖ’±–Å—…’î(§)…ï—’…πÃÅ’’•ê)±Öπù’ÖùîÅ¡±¡ùÕ≈∞)Õïç’…•—‰Åëïô•πï»)Õï–ÅÕïÖ…ç°}¡Ö—†ÄÙÅ¡’â±•å)ÖÃÄêê)ëïç±Ö…î(ÄÅŸ}¡±ÖÂï…}•êÅ’’•êÏ)âïù•∏(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}ù…Ω’¡}çΩëî°¡}ù…Ω’¡}çΩëî§Ï((ÄÅ•òÅ¡}ë•Õ¡±ÖÂ}πÖµîÅ•ÃÅπ’±∞ÅΩ»Åç°Ö…}±ïπù—†°—…•¥°¡}ë•Õ¡±ÖÂ}πÖµî§§ÄÙÄ¿ÅΩ»Åç°Ö…}±ïπù—†°—…•¥°¡}ë•Õ¡±ÖÂ}πÖµî§§Ä¯Ä–¿Å—°ï∏(ÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏ÄùM¡•ï±ï…πÖµîÅ•Õ–Å’πù’ï±—•ú∏úÏ(ÄÅïπêÅ•òÏ((ÄÅ•òÅ¡}¡±ÖÂï…}•êÅ•ÃÅπ’±∞Å—°ï∏(ÄÄÄÅ•πÕï…–Å•π—ºÅ¡’â±•åπ¡±ÖÂï…Ã°ë•Õ¡±ÖÂ}πÖµî∞ÅÖç—•Ÿî§(ÄÄÄÅŸÖ±’ïÃÄ°—…•¥°¡}ë•Õ¡±ÖÂ}πÖµî§∞ÅçΩÖ±ïÕçî°¡}Öç—•Ÿî∞Å—…’î§§(ÄÄÄÅ…ï—’…π•πúÅ•êÅ•π—ºÅŸ}¡±ÖÂï…}•êÏ(ÄÅï±Õî(ÄÄÄÅ’¡ëÖ—îÅ¡’â±•åπ¡±ÖÂï…Ã(ÄÄÄÅÕï–Åë•Õ¡±ÖÂ}πÖµîÄÙÅ—…•¥°¡}ë•Õ¡±ÖÂ}πÖµî§∞(ÄÄÄÄÄÄÄÅÖç—•ŸîÄÙÅçΩÖ±ïÕçî°¡}Öç—•Ÿî∞ÅÖç—•Ÿî§(ÄÄÄÅ›°ï…îÅ•êÄÙÅ¡}¡±ÖÂï…}•ê(ÄÄÄÅ…ï—’…π•πúÅ•êÅ•π—ºÅŸ}¡±ÖÂï…}•êÏ((ÄÄÄÅ•òÅŸ}¡±ÖÂï…}•êÅ•ÃÅπ’±∞Å—°ï∏(ÄÄÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏ÄùM¡•ï±ï»Å›’…ëîÅπ•ç°–Åùïô’πëï∏∏úÏ(ÄÄÄÅïπêÅ•òÏ(ÄÅïπêÅ•òÏ((ÄÅ…ï—’…∏ÅŸ}¡±ÖÂï…}•êÏ)ïπêÏ(êêÏ()ç…ïÖ—îÅΩ»Å…ï¡±ÖçîÅô’πç—•Ω∏Å¡’â±•åπÕ’âµ•—}µÖ—ç††(ÄÅ¡}ù…Ω’¡}çΩëîÅ—ï·–∞(ÄÅ¡}¡±ÖÂïë}Ö–Å—•µïÕ—Öµ¡—Ë∞(ÄÅ¡}—ïÖµ}Ö}ÕçΩ…îÅ•π—ïùï»∞(ÄÅ¡}—ïÖµ}â}ÕçΩ…îÅ•π—ïùï»∞(ÄÅ¡}πΩ—îÅ—ï·–∞(ÄÅ¡}Õ±Ω—ÃÅ©ÕΩπà(§)…ï—’…πÃÅ’’•ê)±Öπù’ÖùîÅ¡±¡ùÕ≈∞)Õïç’…•—‰Åëïô•πï»)Õï–ÅÕïÖ…ç°}¡Ö—†ÄÙÅ¡’â±•å)ÖÃÄêê)ëïç±Ö…î(ÄÅŸ}µÖ—ç°}•êÅ’’•êÏ)âïù•∏(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}ù…Ω’¡}çΩëî°¡}ù…Ω’¡}çΩëî§Ï(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}µÖ—ç°}¡ÖÂ±ΩÖê°¡}¡±ÖÂïë}Ö–∞Å¡}—ïÖµ}Ö}ÕçΩ…î∞Å¡}—ïÖµ}â}ÕçΩ…î∞Å¡}πΩ—î∞Å¡}Õ±Ω—Ã§Ï((ÄÅ•πÕï…–Å•π—ºÅ¡’â±•åπµÖ—ç°ïÃ°¡±ÖÂïë}Ö–∞Å—ïÖµ}Ö}ÕçΩ…î∞Å—ïÖµ}â}ÕçΩ…î∞ÅπΩ—î§(ÄÅŸÖ±’ïÃÄ°¡}¡±ÖÂïë}Ö–∞Å¡}—ïÖµ}Ö}ÕçΩ…î∞Å¡}—ïÖµ}â}ÕçΩ…î∞Åπ’±±•ò°—…•¥°çΩÖ±ïÕçî°¡}πΩ—î∞Äúú§§∞Äúú§§(ÄÅ…ï—’…π•πúÅ•êÅ•π—ºÅŸ}µÖ—ç°}•êÏ((ÄÅ•πÕï…–Å•π—ºÅ¡’â±•åπµÖ—ç°}Õ±Ω—Ã°µÖ—ç°}•ê∞Å¡±ÖÂï…}•ê∞Å—ïÖ¥∞Å…Ω±î§(ÄÅÕï±ïç–ÅŸ}µÖ—ç°}•ê∞Å¡±ÖÂï…}•ê∞Å—ïÖ¥∞Å…Ω±î(ÄÅô…Ω¥Å©ÕΩπâ}—Ω}…ïçΩ…ëÕï–°¡}Õ±Ω—Ã§ÅÖÃÅÕ±Ω–°¡±ÖÂï…}•êÅ’’•ê∞Å—ïÖ¥Å—ï·–∞Å…Ω±îÅ—ï·–§Ï((ÄÅ…ï—’…∏ÅŸ}µÖ—ç°}•êÏ)ïπêÏ(êêÏ()ç…ïÖ—îÅΩ»Å…ï¡±ÖçîÅô’πç—•Ω∏Å¡’â±•åπ’¡ëÖ—ï}µÖ—ç††(ÄÅ¡}ù…Ω’¡}çΩëîÅ—ï·–∞(ÄÅ¡}µÖ—ç°}•êÅ’’•ê∞(ÄÅ¡}¡±ÖÂïë}Ö–Å—•µïÕ—Öµ¡—Ë∞(ÄÅ¡}—ïÖµ}Ö}ÕçΩ…îÅ•π—ïùï»∞(ÄÅ¡}—ïÖµ}â}ÕçΩ…îÅ•π—ïùï»∞(ÄÅ¡}πΩ—îÅ—ï·–∞(ÄÅ¡}Õ±Ω—ÃÅ©ÕΩπà(§)…ï—’…πÃÅ’’•ê)±Öπù’ÖùîÅ¡±¡ùÕ≈∞)Õïç’…•—‰Åëïô•πï»)Õï–ÅÕïÖ…ç°}¡Ö—†ÄÙÅ¡’â±•å)ÖÃÄêê)ëïç±Ö…î(ÄÅŸ}µÖ—ç°}•êÅ’’•êÏ)âïù•∏(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}ù…Ω’¡}çΩëî°¡}ù…Ω’¡}çΩëî§Ï(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}µÖ—ç°}¡ÖÂ±ΩÖê°¡}¡±ÖÂïë}Ö–∞Å¡}—ïÖµ}Ö}ÕçΩ…î∞Å¡}—ïÖµ}â}ÕçΩ…î∞Å¡}πΩ—î∞Å¡}Õ±Ω—Ã§Ï((ÄÅ’¡ëÖ—îÅ¡’â±•åπµÖ—ç°ïÃ(ÄÅÕï–Å¡±ÖÂïë}Ö–ÄÙÅ¡}¡±ÖÂïë}Ö–∞(ÄÄÄÄÄÅ—ïÖµ}Ö}ÕçΩ…îÄÙÅ¡}—ïÖµ}Ö}ÕçΩ…î∞(ÄÄÄÄÄÅ—ïÖµ}â}ÕçΩ…îÄÙÅ¡}—ïÖµ}â}ÕçΩ…î∞(ÄÄÄÄÄÅπΩ—îÄÙÅπ’±±•ò°—…•¥°çΩÖ±ïÕçî°¡}πΩ—î∞Äúú§§∞Äúú§(ÄÅ›°ï…îÅ•êÄÙÅ¡}µÖ—ç°}•ê(ÄÄÄÅÖπêÅ•Õ}ëï±ï—ïêÄÙÅôÖ±Õî(ÄÅ…ï—’…π•πúÅ•êÅ•π—ºÅŸ}µÖ—ç°}•êÏ((ÄÅ•òÅŸ}µÖ—ç°}•êÅ•ÃÅπ’±∞Å—°ï∏(ÄÄÄÅ…Ö•ÕîÅï·çï¡—•Ω∏ÄùM¡•ï∞Å›’…ëîÅπ•ç°–Åùïô’πëï∏∏úÏ(ÄÅïπêÅ•òÏ((ÄÅëï±ï—îÅô…Ω¥Å¡’â±•åπµÖ—ç°}Õ±Ω—Ã(ÄÅ›°ï…îÅµÖ—ç°}•êÄÙÅ¡}µÖ—ç°}•êÏ((ÄÅ•πÕï…–Å•π—ºÅ¡’â±•åπµÖ—ç°}Õ±Ω—Ã°µÖ—ç°}•ê∞Å¡±ÖÂï…}•ê∞Å—ïÖ¥∞Å…Ω±î§(ÄÅÕï±ïç–Å¡}µÖ—ç°}•ê∞Å¡±ÖÂï…}•ê∞Å—ïÖ¥∞Å…Ω±î(ÄÅô…Ω¥Å©ÕΩπâ}—Ω}…ïçΩ…ëÕï–°¡}Õ±Ω—Ã§ÅÖÃÅÕ±Ω–°¡±ÖÂï…}•êÅ’’•ê∞Å—ïÖ¥Å—ï·–∞Å…Ω±îÅ—ï·–§Ï((ÄÅ…ï—’…∏Å¡}µÖ—ç°}•êÏ)ïπêÏ(êêÏ()ç…ïÖ—îÅΩ»Å…ï¡±ÖçîÅô’πç—•Ω∏Å¡’â±•åπëï±ï—ï}µÖ—ç††(ÄÅ¡}ù…Ω’¡}çΩëîÅ—ï·–∞(ÄÅ¡}µÖ—ç°}•êÅ’’•ê(§)…ï—’…πÃÅŸΩ•ê)±Öπù’ÖùîÅ¡±¡ùÕ≈∞)Õïç’…•—‰Åëïô•πï»)Õï–ÅÕïÖ…ç°}¡Ö—†ÄÙÅ¡’â±•å)ÖÃÄêê)âïù•∏(ÄÅ¡ï…ôΩ…¥Å¡’â±•åπÖÕÕï…—}ù…Ω’¡}çΩëî°¡}ù…Ω’¡}çΩëî§Ï((ÄÅ’¡ëÖ—îÅ¡’â±•åπµÖ—ç°ïÃ(ÄÅÕï–Å•Õ}ëï±ï—ïêÄÙÅ—…’î∞(ÄÄÄÄÄÅëï±ï—ïë}Ö–ÄÙÅπΩ‹†§(ÄÅ›°ï…îÅ•êÄÙÅ¡}µÖ—ç°}•ê(ÄÄÄÅÖπêÅ•Õ}ëï±ï—ïêÄÙÅôÖ±ÕîÏ)ïπêÏ(êêÏ()ù…Öπ–Å’ÕÖùîÅΩ∏ÅÕç°ïµÑÅ¡’â±•åÅ—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–ÅÕï±ïç–ÅΩ∏Å¡’â±•åπ¡±ÖÂï…Ã∞Å¡’â±•åπµÖ—ç°ïÃ∞Å¡’â±•åπµÖ—ç°}Õ±Ω—Ã∞Å¡’â±•åπ≠ïï¡Ö±•ŸîÅ—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)…ïŸΩ≠îÅÖ±∞ÅΩ∏Å¡’â±•åπÖ¡¡}Õï——•πùÃ∞Å¡’â±•åπ—…’Õ—ïë}ëïŸ•çïÃÅô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ()…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ…ïù•Õ—ï…}—…’Õ—ïë}ëïŸ•çî°—ï·–§Åô…Ω¥Å¡’â±•åÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ…ïŸΩ≠ï}—…’Õ—ïë}ëïŸ•çî°—ï·–§Åô…Ω¥Å¡’â±•åÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ’¡Õï…—}¡±ÖÂï»°—ï·–∞Å’’•ê∞Å—ï·–∞ÅâΩΩ±ïÖ∏§Åô…Ω¥Å¡’â±•åÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπÕ’âµ•—}µÖ—ç†°—ï·–∞Å—•µïÕ—Öµ¡—Ë∞Å•π—ïùï»∞Å•π—ïùï»∞Å—ï·–∞Å©ÕΩπà§Åô…Ω¥Å¡’â±•åÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ’¡ëÖ—ï}µÖ—ç†°—ï·–∞Å’’•ê∞Å—•µïÕ—Öµ¡—Ë∞Å•π—ïùï»∞Å•π—ïùï»∞Å—ï·–∞Å©ÕΩπà§Åô…Ω¥Å¡’â±•åÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπëï±ï—ï}µÖ—ç†°—ï·–∞Å’’•ê§Åô…Ω¥Å¡’â±•åÏ()ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ…ïù•Õ—ï…}—…’Õ—ïë}ëïŸ•çî°—ï·–§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ…ïŸΩ≠ï}—…’Õ—ïë}ëïŸ•çî°—ï·–§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ’¡Õï…—}¡±ÖÂï»°—ï·–∞Å’’•ê∞Å—ï·–∞ÅâΩΩ±ïÖ∏§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπÕ’âµ•—}µÖ—ç†°—ï·–∞Å—•µïÕ—Öµ¡—Ë∞Å•π—ïùï»∞Å•π—ïùï»∞Å—ï·–∞Å©ÕΩπà§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπ’¡ëÖ—ï}µÖ—ç†°—ï·–∞Å’’•ê∞Å—•µïÕ—Öµ¡—Ë∞Å•π—ïùï»∞Å•π—ïùï»∞Å—ï·–∞Å©ÕΩπà§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)ù…Öπ–Åï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπëï±ï—ï}µÖ—ç†°—ï·–∞Å’’•ê§Å—ºÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ()…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπÕï—}ù…Ω’¡}çΩëî°—ï·–§Åô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπŸÖ±•ëÖ—ï}ù…Ω’¡}çΩëî°—ï·–§Åô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπÖÕÕï…—}ù…Ω’¡}çΩëî°—ï·–§Åô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπç±ïÖπ’¡}ï·¡•…ïë}—…’Õ—ïë}ëïŸ•çïÃ†§Åô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ)…ïŸΩ≠îÅï·ïç’—îÅΩ∏Åô’πç—•Ω∏Å¡’â±•åπÖÕÕï…—}µÖ—ç°}¡ÖÂ±ΩÖê°—•µïÕ—Öµ¡—Ë∞Å•π—ïùï»∞Å•π—ïùï»∞Å—ï·–∞Å©ÕΩπà§Åô…Ω¥Å¡’â±•å∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïêÏ()Õï±ïç–Åç…Ω∏πÕç°ïë’±î†(ÄÄùç±ïÖπ’¿µï·¡•…ïêµ—…’Õ—ïêµëïŸ•çïÃú∞(ÄÄú¿ÄÃÄƒÄ®Ä®ú∞(ÄÄêëÕï±ïç–Å¡’â±•åπç±ïÖπ’¡}ï·¡•…ïë}—…’Õ—ïë}ëïŸ•çïÃ†§Ïêê(§Ï((¥¥ÅI’∏ÅΩπçîÅÖô—ï»ÅÖ¡¡±Â•πúÅ—°•ÃÅÕç°ïµÑ∞Å—°ï∏Å…ï¡±ÖçîÅ—°îÅŸÖ±’îÅ›°ïπïŸï»Å—°îÅÕ°Ö…ïêÅçΩëîÅç°ÖπùïÃË(¥¥ÅÕï±ïç–Å¡’â±•åπÕï—}ù…Ω’¡}çΩëî†ùëï•∏µçΩëîú§Ï