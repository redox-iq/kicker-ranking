import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PAGE_SIZE = 1000;
const TABLES = [
  { name: "players", order: "created_at.asc" },
  { name: "matches", order: "played_at.asc" },
  { name: "match_slots", order: "created_at.asc" },
];

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const outputDir = process.env.BACKUP_OUTPUT_DIR || "backups";

if (!supabaseUrl || !anonKey) {
  console.error("Missing SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
  process.exit(1);
}

async function fetchTable(table) {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table.name}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", table.order);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to export ${table.name}: ${response.status} ${body}`);
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }

    offset += PAGE_SIZE;
  }
}

const createdAt = new Date();
const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
const backup = {
  meta: {
    formatVersion: 1,
    createdAt: createdAt.toISOString(),
    sourceHost: new URL(supabaseUrl).host,
    exportType: "public-rls",
    note: "Exports public app tables through Supabase RLS. app_settings and soft-deleted rows are not included.",
  },
};

for (const table of TABLES) {
  backup[table.name] = await fetchTable(table);
}

await mkdir(outputDir, { recursive: true });

const outputPath = join(outputDir, `kicker-ranking-public-backup-${stamp}.json`);
await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

console.log(`Backup written to ${outputPath}`);
for (const table of TABLES) {
  console.log(`${table.name}: ${backup[table.name].length} rows`);
}
