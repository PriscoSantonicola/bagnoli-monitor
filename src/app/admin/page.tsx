import Link from "next/link";
import { q } from "@/lib/db";
import { formatInt, formatMeur, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SheetRow = {
  id: number;
  sheet_name: string;
  ordine: number;
  nrows: number;
  ncols: number;
  imported_at: string;
};

type GlobalStats = {
  tot_cup: number;
  tot_task: number;
  tot_gare: number;
  tot_fonti: number;
  tot_finanziamenti: number;
  pct_medio: number;
  tot_sheet: number;
  tot_excel_row: number;
};

async function loadAdmin() {
  const [sheets, globalStats] = await Promise.all([
    q<SheetRow>(`
      SELECT id, sheet_name, ordine, nrows, ncols,
             imported_at::text AS imported_at
      FROM bagnoli_cantieri.excel_sheet
      ORDER BY ordine, sheet_name;
    `),
    q<GlobalStats>(`
      SELECT
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.cup)                                  AS tot_cup,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.task WHERE versione_id=1)             AS tot_task,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.attivita_gara WHERE versione_id=1)    AS tot_gare,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.fonte_finanziamento WHERE versione_id=1) AS tot_fonti,
        (SELECT COALESCE(SUM(importo_eur),0)::numeric::float
           FROM bagnoli_cantieri.fonte_finanziamento WHERE versione_id=1)                 AS tot_finanziamenti,
        (SELECT COALESCE(AVG(percentuale_avanzamento),0)::numeric::float
           FROM bagnoli_cantieri.task WHERE versione_id=1)                                AS pct_medio,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.excel_sheet)                          AS tot_sheet,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.excel_row)                            AS tot_excel_row;
    `),
  ]);
  return { sheets, stats: globalStats[0] };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/à/g, "a").replace(/è/g, "e").replace(/é/g, "e")
    .replace(/ì/g, "i").replace(/ò/g, "o").replace(/ù/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function AdminPage() {
  const { sheets, stats } = await loadAdmin();

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="logo">
            <div
              className="logo-icon"
              style={{ background: "linear-gradient(135deg,#0f172a,#2563eb)" }}
            >
              <i className="fas fa-lock"></i>
            </div>
            <div className="logo-text">
              <h1>Bagnoli Monitor · Area Riservata</h1>
              <span>
                Confronto 1:1 con Excel {`"MONITORAGGIO Cronoprogramma Prisco Ver. 2.12.xlsx"`} — schema{" "}
                <code>bagnoli_cantieri</code> (Hetzner)
              </span>
            </div>
          </div>
          <nav className="topnav">
            <a href="/">← Sito pubblico</a>
          </nav>
        </div>
      </header>

      <div className="container" style={{ padding: "32px 24px" }}>
        {/* Stats sintesi */}
        <div className="stato-grid">
          <StatoCard color="blue" icon="fa-table" value={stats.tot_sheet} label="Sheet Excel importati" />
          <StatoCard color="green" icon="fa-list-ul" value={stats.tot_excel_row} label="Righe Excel dump" />
          <StatoCard color="orange" icon="fa-diagram-project" value={stats.tot_cup} label="CUP registrati" />
          <StatoCard color="red" icon="fa-gavel" value={stats.tot_gare} label="Gare d'appalto" />
        </div>

        {/* Macro riepilogo importi */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            <i className="fas fa-chart-pie"></i> Sintesi importazione
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
            <MiniStat label="Task cronoprogramma" value={formatInt(stats.tot_task)} />
            <MiniStat label="Fonti finanziamento" value={formatInt(stats.tot_fonti)} />
            <MiniStat label="Budget complessivo" value={formatMeur(stats.tot_finanziamenti)} />
            <MiniStat label="Avanzamento medio" value={formatPct(stats.pct_medio, 1)} />
          </div>
        </section>

        {/* Indice sheet (come Excel) */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            <i className="fas fa-file-excel"></i> Sheet Excel ({sheets.length})
          </h3>
          <p style={{ color: "var(--text3)", marginTop: -10, marginBottom: 14, fontSize: 13 }}>
            Ogni sheet e&apos; accessibile come nell&apos;Excel originale, con la stessa
            posizione e contenuto importato. Clicca su uno sheet per vederne il contenuto
            tabellare come nel file sorgente.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
              gap: 12,
            }}
          >
            {sheets.map((s) => (
              <Link
                key={s.id}
                href={`/admin/sheet/${slugify(s.sheet_name)}`}
                style={{
                  textDecoration: "none",
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  color: "var(--text)",
                  transition: "all .15s",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>
                  Sheet {s.ordine + 1}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.sheet_name}</div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  {s.nrows} righe × {s.ncols} colonne
                </div>
              </Link>
            ))}
          </div>
        </section>

        <p style={{ marginTop: 32, fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
          Confronto Excel vs DB · Ogni sheet e&apos; leggibile per verifica manuale. Budget
          complessivo (fonti finanziamento versione attiva): <strong>{formatMeur(stats.tot_finanziamenti)}</strong>
        </p>
      </div>
    </div>
  );
}

function StatoCard({
  color,
  icon,
  value,
  label,
}: {
  color: "blue" | "green" | "orange" | "red";
  icon: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className={`stato-card ${color}`}>
      <div className="stato-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="stato-val">{typeof value === "number" ? formatInt(value) : value}</div>
      <div className="stato-lbl">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  padding: 24,
  boxShadow: "var(--shadow)",
  marginBottom: 24,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "var(--text)",
};
