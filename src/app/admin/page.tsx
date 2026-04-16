import { q } from "@/lib/db";
import { formatDate, formatEuro, formatInt, formatMeur, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CupRow = {
  id: number;
  codice: string;
  macro_area: string | null;
  titolo: string;
  importo_intervento_eur: number | null;
  importo_somme_disp_eur: number | null;
};

type VersRow = {
  id: number;
  codice: string;
  fonte: string;
  data_riferimento: string;
  is_ufficiale: boolean;
  descrizione: string | null;
};

type GaraRow = {
  id: number;
  cig: string | null;
  oggetto: string;
  procedura: string | null;
  aggiudicatario: string | null;
  importo_base_eur: number | null;
  data_pubblicazione: string | null;
};

async function loadAdmin() {
  const [cups, versioni, gare, globalStats] = await Promise.all([
    q<CupRow>(`
      SELECT c.id, c.codice, c.macro_area, c.titolo,
             s.importo_intervento_eur, s.importo_somme_disp_eur
      FROM bagnoli_cantieri.cup c
      LEFT JOIN bagnoli_cantieri.sintesi_intervento s
        ON s.cup_id = c.id AND s.versione_id = 1
      ORDER BY c.macro_area NULLS LAST, c.codice;
    `),
    q<VersRow>(`
      SELECT id, codice, fonte, data_riferimento::text AS data_riferimento,
             is_ufficiale, descrizione
      FROM bagnoli_cantieri.cronoprogramma_versione
      ORDER BY data_riferimento DESC;
    `),
    q<GaraRow>(`
      SELECT id, cig, oggetto, procedura, aggiudicatario,
             importo_base_eur,
             data_pubblicazione::text AS data_pubblicazione
      FROM bagnoli_cantieri.attivita_gara
      WHERE versione_id = 1
      ORDER BY data_pubblicazione DESC NULLS LAST
      LIMIT 20;
    `),
    q<{
      tot_cup: number;
      tot_task: number;
      tot_gare: number;
      tot_fonti: number;
      tot_finanziamenti: number;
      pct_medio: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.cup)                                 AS tot_cup,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.task WHERE versione_id=1)            AS tot_task,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.attivita_gara WHERE versione_id=1)   AS tot_gare,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.fonte_finanziamento WHERE versione_id=1) AS tot_fonti,
        (SELECT COALESCE(SUM(importo_eur),0)::numeric::float
           FROM bagnoli_cantieri.fonte_finanziamento WHERE versione_id=1)                AS tot_finanziamenti,
        (SELECT COALESCE(AVG(percentuale_avanzamento),0)::numeric::float
           FROM bagnoli_cantieri.task WHERE versione_id=1)                               AS pct_medio;
    `),
  ]);

  return { cups, versioni, gare, stats: globalStats[0] };
}

export default async function AdminPage() {
  const { cups, versioni, gare, stats } = await loadAdmin();

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="logo">
            <div className="logo-icon" style={{ background: "linear-gradient(135deg,#0f172a,#2563eb)" }}>
              <i className="fas fa-lock"></i>
            </div>
            <div className="logo-text">
              <h1>Bagnoli Monitor · Area Riservata</h1>
              <span>Console amministratore — schema bagnoli_cantieri (Hetzner)</span>
            </div>
          </div>
          <nav className="topnav">
            <a href="/">← Torna al sito pubblico</a>
          </nav>
        </div>
      </header>

      <div className="container" style={{ padding: "32px 24px" }}>
        {/* Stats */}
        <div className="stato-grid">
          <div className="stato-card blue">
            <div className="stato-icon">
              <i className="fas fa-diagram-project"></i>
            </div>
            <div className="stato-val">{formatInt(stats.tot_cup)}</div>
            <div className="stato-lbl">CUP registrati</div>
          </div>
          <div className="stato-card green">
            <div className="stato-icon">
              <i className="fas fa-list-check"></i>
            </div>
            <div className="stato-val">{formatInt(stats.tot_task)}</div>
            <div className="stato-lbl">Task operativi</div>
          </div>
          <div className="stato-card orange">
            <div className="stato-icon">
              <i className="fas fa-gavel"></i>
            </div>
            <div className="stato-val">{formatInt(stats.tot_gare)}</div>
            <div className="stato-lbl">Gare d&apos;appalto</div>
          </div>
          <div className="stato-card red">
            <div className="stato-icon">
              <i className="fas fa-percent"></i>
            </div>
            <div className="stato-val">{formatPct(stats.pct_medio, 1)}</div>
            <div className="stato-lbl">Avanzamento medio</div>
          </div>
        </div>

        {/* Versioni Cronoprogramma */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            <i className="fas fa-clock-rotate-left"></i> Versioni Cronoprogramma
          </h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Codice</th>
                <th style={thStyle}>Fonte</th>
                <th style={thStyle}>Data riferimento</th>
                <th style={thStyle}>Ufficiale</th>
                <th style={thStyle}>Descrizione</th>
              </tr>
            </thead>
            <tbody>
              {versioni.map((v) => (
                <tr key={v.id}>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{v.codice}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(v.fonte === "EXCEL" ? "#2563eb" : "#16a34a")}>{v.fonte}</span>
                  </td>
                  <td style={tdStyle}>{formatDate(v.data_riferimento)}</td>
                  <td style={tdStyle}>
                    {v.is_ufficiale ? (
                      <span style={badgeStyle("#16a34a")}>ufficiale</span>
                    ) : (
                      <span style={badgeStyle("#64748b")}>operativo</span>
                    )}
                  </td>
                  <td style={tdStyle}>{v.descrizione || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* CUP list */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            <i className="fas fa-tag"></i> CUP ({cups.length})
          </h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Codice CUP</th>
                <th style={thStyle}>Macro-area</th>
                <th style={thStyle}>Titolo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Importo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Consuntivo 31/12</th>
              </tr>
            </thead>
            <tbody>
              {cups.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{c.codice}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(colorForMacro(c.macro_area))}>{c.macro_area || "-"}</span>
                  </td>
                  <td style={tdStyle}>{c.titolo}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                    {formatEuro(c.importo_intervento_eur)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--text3)" }}>
                    {formatEuro(c.importo_somme_disp_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Gare recenti */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            <i className="fas fa-gavel"></i> Ultime {gare.length} gare pubblicate
          </h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>CIG</th>
                <th style={thStyle}>Oggetto</th>
                <th style={thStyle}>Procedura</th>
                <th style={thStyle}>Stazione</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Importo base</th>
                <th style={thStyle}>Pubblicazione</th>
              </tr>
            </thead>
            <tbody>
              {gare.map((g) => (
                <tr key={g.id}>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>{g.cig || "-"}</td>
                  <td style={{ ...tdStyle, maxWidth: 360 }}>{g.oggetto}</td>
                  <td style={tdStyle}>{g.procedura || "-"}</td>
                  <td style={tdStyle}>{g.aggiudicatario || "-"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatEuro(g.importo_base_eur)}</td>
                  <td style={tdStyle}>{formatDate(g.data_pubblicazione)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p style={{ marginTop: 32, fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
          Budget complessivo: <strong>{formatMeur(stats.tot_finanziamenti)}</strong> ·{" "}
          {formatInt(stats.tot_fonti)} fonti di finanziamento
        </p>
      </div>
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
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 700,
  color: "var(--text3)",
  borderBottom: "2px solid var(--border)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".5px",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
};
function badgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".4px",
    background: color + "22",
    color,
  };
}
function colorForMacro(m: string | null): string {
  if (!m) return "#64748b";
  if (m.includes("Risanamento")) return "#16a34a";
  if (m.includes("Rigenerazione")) return "#2563eb";
  if (m.includes("Infrastru")) return "#f59e0b";
  if (m.includes("Trasv")) return "#7c3aed";
  return "#64748b";
}
