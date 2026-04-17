import Link from "next/link";
import { q } from "@/lib/db";
import { formatInt, formatMeur } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Stats = {
  n_cruscotto: number;
  n_crono: number;
  n_sca_go: number;
  n_sca_stop: number;
  n_milestone: number;
  n_gantt: number;
  n_gantt_with_ranges: number;
  tot_budget: number;
};

async function loadStats(): Promise<Stats> {
  const [r] = await q<Stats>(`
    SELECT
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.cruscotto_task) AS n_cruscotto,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.crono_task)      AS n_crono,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.scadenza WHERE tipo='GO')   AS n_sca_go,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.scadenza WHERE tipo='STOP') AS n_sca_stop,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.milestone_point) AS n_milestone,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.gantt_row)       AS n_gantt,
      (SELECT COUNT(*)::int FROM bagnoli_cantieri.gantt_row WHERE jsonb_array_length(ranges)>0) AS n_gantt_with_ranges,
      (SELECT COALESCE(SUM(importo_eur),0)::numeric::float
         FROM bagnoli_cantieri.fonte_finanziamento WHERE versione_id=1) AS tot_budget
  `);
  return r;
}

const SHEETS = [
  {
    slug: "cruscotto",
    name: "Cruscotto",
    icon: "fa-tachometer-alt",
    color: "#2563eb",
    desc: "Dashboard Excel: header Commissario, filtri PRARU/Territorio/Procedimento, KPI MILESTONE e Avanzamento Attività, tabella 22 task con % e mini-Gantt.",
    key: "n_cruscotto" as const,
    label: "task",
  },
  {
    slug: "cronoprogramma",
    name: "CronoProgramma",
    icon: "fa-project-diagram",
    color: "#0ea5e9",
    desc: "Albero gerarchico degli ID (6, 6.1, 6.2…) con Obiettivo Generale, Azioni, A-F Procedimento, durate e avanzamento.",
    key: "n_crono" as const,
    label: "righe",
  },
  {
    slug: "scadenze-go",
    name: "Scadenze GO",
    icon: "fa-play-circle",
    color: "#16a34a",
    desc: "Attività in avvio ordinate per data di Inizio (A – F Procedimento).",
    key: "n_sca_go" as const,
    label: "scadenze",
  },
  {
    slug: "scadenze-stop",
    name: "Scadenze STOP",
    icon: "fa-flag-checkered",
    color: "#ef4444",
    desc: "Attività in conclusione ordinate per data di Fine (A – F Procedimento).",
    key: "n_sca_stop" as const,
    label: "scadenze",
  },
  {
    slug: "timeline-milestone",
    name: "Timeline - MILESTONE",
    icon: "fa-diamond",
    color: "#f59e0b",
    desc: "Timeline orizzontale SVG con cerchi verdi (Risanamento) e quadrati blu (Realizzazione), marker OGGI.",
    key: "n_milestone" as const,
    label: "milestone",
  },
  {
    slug: "gantt",
    name: "Gantt",
    icon: "fa-bars",
    color: "#7c3aed",
    desc: "Griglia calendario giornaliera con barre attività per task (compressione automatica degli X in range contigui).",
    key: "n_gantt" as const,
    label: "task rows",
  },
];

export default async function AdminPage() {
  const stats = await loadStats();

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
                Confronto 1:1 con Excel <code>MONITORAGGIO Cronoprogramma Prisco Ver. 2.12.xlsx</code>
              </span>
            </div>
          </div>
          <nav className="topnav">
            <a href="/">← Sito pubblico</a>
          </nav>
        </div>
      </header>

      <div className="container" style={{ padding: "32px 24px" }}>
        {/* Sintesi */}
        <section
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 20,
            boxShadow: "var(--shadow)",
            marginBottom: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 14,
          }}
        >
          <Mini label="Task Cruscotto"    value={formatInt(stats.n_cruscotto)} />
          <Mini label="Righe CronoProg."  value={formatInt(stats.n_crono)} />
          <Mini label="Scadenze GO"       value={formatInt(stats.n_sca_go)} />
          <Mini label="Scadenze STOP"     value={formatInt(stats.n_sca_stop)} />
          <Mini label="Milestone"         value={formatInt(stats.n_milestone)} />
          <Mini label="Righe Gantt"       value={formatInt(stats.n_gantt)} />
          <Mini label="Budget totale"     value={formatMeur(stats.tot_budget)} />
        </section>

        {/* Indice 6 sheet */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
            gap: 18,
          }}
        >
          {SHEETS.map((s) => (
            <Link
              key={s.slug}
              href={`/admin/sheet/${s.slug}`}
              style={{
                textDecoration: "none",
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                color: "var(--text)",
                boxShadow: "var(--shadow)",
                transition: "transform .15s, box-shadow .15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: s.color + "18",
                    color: s.color,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                  }}
                >
                  <i className={`fas ${s.icon}`}></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>
                    {formatInt(stats[s.key])} {s.label}
                  </div>
                </div>
                <i className="fas fa-arrow-right" style={{ color: s.color }}></i>
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>
                {s.desc}
              </div>
            </Link>
          ))}
        </div>

        <p
          style={{
            marginTop: 32,
            fontSize: 12,
            color: "var(--text3)",
            textAlign: "center",
          }}
        >
          Ogni pagina replica struttura e valori del rispettivo sheet Excel. Apri un box
          per visualizzarlo.
        </p>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text3)",
          textTransform: "uppercase",
          letterSpacing: ".5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
