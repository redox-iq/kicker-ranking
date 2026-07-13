# Uni-Kicker Ranking

Deutschsprachige 2v2-Tischkicker-App fuer Uni-Freunde. Die App zeigt Spieler-, Rollen- und Team-Rankings, nimmt Matches mit Rollen entgegen und kann mit Supabase als gemeinsamer Datenstand betrieben werden.

## Lokal starten

```powershell
npm.cmd install
npm.cmd run dev
```

Ohne Supabase-Konfiguration nutzt die App Demodaten in `localStorage`. Der lokale Schreibcode ist standardmaessig `kicker` oder `VITE_LOCAL_GROUP_CODE`.

## Supabase einrichten

1. Neues Supabase-Projekt anlegen.
2. `supabase/schema.sql` im SQL Editor ausfuehren.
3. Danach den Gruppen-Code setzen:

```sql
select public.set_group_code('dein-code');
```

4. `.env.local` mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen.
5. App neu starten.

Die Supabase-Tabellen sind oeffentlich lesbar, Schreibzugriffe laufen ueber RPC-Funktionen und pruefen den Gruppen-Code serverseitig.

## GitHub Pages

Der GitHub-Pages-Workflow liest die Supabase-Konfiguration aus Repository Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nach Aenderungen an diesen Variables den Workflow `Deploy GitHub Pages` neu ausfuehren oder einen neuen Commit pushen.

## Supabase Backups und Keepalive

Die Workflows `Supabase Backup` und `Supabase Keepalive` brauchen diese Repository Secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Verwende dafuer die gleiche Supabase Project URL und den gleichen anon/public Key wie bei der App. Nicht den `service_role`-Key und nicht das Datenbank-Passwort verwenden.

`Supabase Keepalive` fragt zweimal taeglich die harmlose Tabelle `keepalive` ab. Die Tabelle ist im aktuellen `supabase/schema.sql` enthalten; fuehre das Schema im Supabase SQL Editor erneut aus, wenn die Tabelle in deinem Projekt noch fehlt.

`Supabase Backup` exportiert etwa alle drei Tage die oeffentlich per RLS lesbaren App-Tabellen `players`, `matches` und `match_slots` als JSON-Artefakt in GitHub Actions. Die Artefakte werden 90 Tage aufbewahrt und danach automatisch geloescht. `app_settings`, der Gruppen-Code-Hash und soft-geloeschte Matches werden nicht exportiert.
