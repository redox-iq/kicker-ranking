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
