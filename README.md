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

## Dieses Geraet 30 Tage merken

Neben dem Gruppen-Code kann die App ein Geraet fuer 30 Tage freischalten. Aktiviere dazu `30 Tage merken` und fuehre die naechste Aenderung aus. Nach erfolgreicher Code-Pruefung erzeugt Supabase einen zufaelligen Geraete-Token. Im Browser liegt nur dieser Token; Supabase speichert davon lediglich einen SHA-256-Hash. Der eigentliche Gruppen-Code wird nicht dauerhaft gespeichert.

Bei bestehenden Supabase-Projekten muss `supabase/trusted-device-migration.sql` einmal im SQL Editor ausgefuehrt werden. Bei einer Neueinrichtung reicht das vollstaendige `supabase/schema.sql`. Dadurch werden die Tabelle `trusted_devices`, die Token-Funktionen und die korrigierten Funktionsrechte eingerichtet. Ueber `Geraet vergessen` wird die lokale Freigabe entfernt und der Token in Supabase widerrufen.

Supabase Cron entfernt abgelaufene und widerrufene Geraete-Tokens automatisch am ersten Tag jedes Monats um 03:00 UTC. Ein Kalender-Cron kann kein exakt gleich langes 30-Tage-Intervall ueber unterschiedlich lange Monate ausdruecken; der Aufraeumlauf findet deshalb alle 28 bis 31 Tage statt.

Schlaegt eine Aenderung wegen eines falschen Codes, einer abgelaufenen Geraetefreigabe oder eines Netzwerkfehlers fehl, bleiben die eingegebenen Formularwerte erhalten.

## GitHub Pages

Der GitHub-Pages-Workflow liest die Supabase-Konfiguration aus Repository Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nach Aenderungen an diesen Variables den Workflow `Deploy GitHub Pages` neu ausfuehren oder einen neuen Commit pushen.

## Supabase Backups und Keepalive

Die Workflows `Supabase Backup` und `Supabase Keepalive` lesen die Supabase-Konfiguration aus diesen Repository Secrets oder Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Alternativ verwenden sie automatisch die vorhandenen GitHub-Pages-Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Verwende dafuer die Supabase Project URL und den anon/public Key. Nicht den `service_role`-Key und nicht das Datenbank-Passwort verwenden.

`Supabase Keepalive` fragt zweimal taeglich die harmlose Tabelle `keepalive` ab. Die Tabelle ist im aktuellen `supabase/schema.sql` enthalten; fuehre das Schema im Supabase SQL Editor erneut aus, wenn die Tabelle in deinem Projekt noch fehlt.

`Supabase Backup` exportiert etwa alle drei Tage die oeffentlich per RLS lesbaren App-Tabellen `players`, `matches` und `match_slots` als JSON-Artefakt in GitHub Actions. Die Artefakte werden 90 Tage aufbewahrt und danach automatisch geloescht. `app_settings`, der Gruppen-Code-Hash und soft-geloeschte Matches werden nicht exportiert.
