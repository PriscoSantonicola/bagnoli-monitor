import { q } from "@/lib/db";
import { AdminSheetLayout } from "@/components/AdminSheetLayout";
import { formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Task = {
  id: number;
  id_crono: string;
  obiettivo_generale: string | null;
  obiettivi_specifici: string | null;
  azioni: string | null;
  sub_ambito: string | null;
  superficie: string | null;
  area_tematica: string | null;
  unita_intervento: string | null;
  tipologia: string | null;
  attivita: string | null;
  inizio: string | null;
  fine: string | null;
  durata_giorni: number | null;
  pct_avanzamento: number | null;
  row_idx: number;
};

type Slicers = {
  ambito: string[];
  obiettivo_generale: string[];
  obiettivi_specifici: string[];
  azioni: string[];
  superficie: string[];
  area_tematica: string[];
  unita_intervento: string[];
  tipologia: string[];
  attivita: string[];
  stato_proc: string[];
  contratto: string[];
  oggetto: string[];
  livello: string[];
  sub_livello: string[];
  n_milestone: number;
  n_interconnessioni: number;
};

async function loadData() {
  const tasks = await q<Task>(
    `SELECT id, id_crono, obiettivo_generale, obiettivi_specifici, azioni, sub_ambito,
            superficie, area_tematica, unita_intervento, tipologia, attivita,
            inizio::text AS inizio, fine::text AS fine,
            durata_giorni, pct_avanzamento::float AS pct_avanzamento, row_idx
       FROM bagnoli_cantieri.cruscotto_task ORDER BY row_idx;`
  );

  const distinct = async (col: string) =>
    (await q<{ v: string }>(
      `SELECT DISTINCT ${col} AS v FROM bagnoli_cantieri.crono_task WHERE ${col} IS NOT NULL ORDER BY ${col}`
    )).map((r) => r.v);

  const [
    ambito, obiettivo_generale, obiettivi_specifici, azioni,
    superficie, area_tematica, unita_intervento, tipologia,
    attivita, stato_proc, contratto, oggetto, livello, sub_livello,
  ] = await Promise.all([
    distinct("sub_ambito"),
    distinct("obiettivo_generale"),
    distinct("obiettivi_specifici"),
    distinct("azioni"),
    distinct("superficie"),
    distinct("area_tematica"),
    distinct("unita_intervento"),
    distinct("tipologia"),
    distinct("attivita"),
    distinct("stato_proc_amm"),
    distinct("contratto"),
    distinct("oggetto"),
    distinct("livello_proc"),
    distinct("sub_livello_proc"),
  ]);

  const [meta] = await q<{ n_milestone: number; n_interconnessioni: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM bagnoli_cantieri.milestone_point) AS n_milestone,
       COALESCE((SELECT SUM(n_interconnessioni)::int FROM bagnoli_cantieri.crono_task),0) AS n_interconnessioni`
  );

  const slicers: Slicers = {
    ambito, obiettivo_generale, obiettivi_specifici, azioni,
    superficie, area_tematica, unita_intervento, tipologia,
    attivita, stato_proc, contratto, oggetto, livello, sub_livello,
    ...meta,
  };

  return { tasks, slicers };
}

const PERIODO_INIZIO = new Date("2021-10-07");
const PERIODO_FINE = new Date("2030-06-30");

function calcKpi(tasks: Task[]) {
  const n = tasks.length;
  const notStarted = tasks.filter((t) => !t.pct_avanzamento).length;
  const inProgress = tasks.filter((t) => t.pct_avanzamento && t.pct_avanzamento > 0 && t.pct_avanzamento < 1).length;
  const completed = tasks.filter((t) => t.pct_avanzamento && t.pct_avanzamento >= 1).length;
  const today = new Date();
  const totDays = (PERIODO_FINE.getTime() - PERIODO_INIZIO.getTime()) / 86400000;
  const elapsed = (today.getTime() - PERIODO_INIZIO.getTime()) / 86400000;
  const pctGiorni = Math.min(100, Math.max(0, (elapsed / totDays) * 100));
  return { n, notStarted, inProgress, completed, pctGiorni };
}

export default async function CruscottoPage() {
  const { tasks, slicers } = await loadData();
  const kpi = calcKpi(tasks);

  return (
    <AdminSheetLayout
      active="cruscotto"
      title="Cruscotto"
      subtitle="Dashboard Excel – confronto 1:1"
    >
      {/* ======= QUADRO SINOTTICO ======= */}
      <div className="cr-sinottico">
        <div className="cr-stemma">
          <div className="cr-stemma-icon">
            <i className="fas fa-landmark"></i>
          </div>
          <div style={{ fontSize: 8, textAlign: "center", lineHeight: 1.3, color: "#1e293b" }}>
            <strong>Commissariato</strong>
            <br />Bonifica Bagnoli Coroglio
          </div>
        </div>

        <div className="cr-info">
          <h3>Commissario Straordinario del Governo per la bonifica ambientale e rigenerazione urbana del sito di interesse nazionale Bagnoli Coroglio</h3>
          <div><strong>Commissario:</strong> Prof. G. MANFREDI (Sindaco di Napoli)</div>
          <div><strong>Sub Commissari:</strong> Prof. F. De Rossi – Notaio D. Falconio</div>
          <div><strong>Dirigenti:</strong> Dott. A. Auricchio – Ing. G. Napolitano</div>
        </div>

        <div className="cr-title-box">
          <div>
            <div className="t1">Monitoraggio Attività</div>
            <div className="t2">SIN <strong style={{ color: "#000" }}>Bagnoli Coroglio</strong></div>
          </div>
        </div>

        <div className="cr-donut-row">
          <div className="cr-donut-box">
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 2 }}>
              % Giorni completati
            </div>
            <Donut pct={kpi.pctGiorni} />
          </div>
          <div>
            <div className="cr-avanz-title">Avanzamento Attività</div>
            <div className="cr-avanz-legend">
              <div>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#ef4444", marginRight: 3 }} />
                Non iniziati
              </div>
              <div>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#60a5fa", marginRight: 3 }} />
                In avanzamento
              </div>
              <div>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#16a34a", marginRight: 3 }} />
                Completati
              </div>
            </div>
            <div className="cr-avanz-stats">
              <div style={{ background: "#ef4444" }}>
                <span className="val-sm">{kpi.notStarted}</span>
              </div>
              <div style={{ background: "#60a5fa" }}>
                <span className="val-lg">{kpi.inProgress}</span>
              </div>
              <div style={{ background: "#16a34a" }}>
                <span className="val-sm">{kpi.completed}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="cr-mappa">
          <div className="cr-mappa-title">SIN Bagnoli Coroglio</div>
          <svg width="100%" height="72" viewBox="0 0 200 72" style={{ display: "block" }}>
            <defs>
              <pattern id="sea" width="12" height="12" patternUnits="userSpaceOnUse">
                <rect width="12" height="12" fill="#bae6fd" />
                <circle cx="6" cy="6" r="1" fill="#0ea5e9" opacity=".4" />
              </pattern>
            </defs>
            <rect x="0" y="50" width="200" height="22" fill="url(#sea)" />
            <path d="M0 50 Q50 40, 100 45 T200 43 L200 50 Z" fill="#c9d9b7" stroke="#7a8f5a" strokeWidth="1" />
            <path d="M40 35 L60 25 L90 27 L110 20 L140 23 L170 30 L190 40" fill="none" stroke="#7a8f5a" strokeWidth="1.5" />
            <circle cx="110" cy="46" r="3" fill="#ef4444" />
          </svg>
          <div className="cr-mappa-meta">
            <span><strong style={{ color: "#f59e0b" }}>{slicers.n_milestone}</strong> MILESTONE</span>
            <span><strong style={{ color: "#7c3aed" }}>{slicers.n_interconnessioni}</strong> Interconness.</span>
          </div>
        </div>
      </div>

      {/* ======= FILTRI ======= */}
      <div className="cr-filters">
        <div className="cr-filter-col">
          <FilterBox title="Ambito" accent="#16a34a">
            <Chips values={slicers.ambito} />
          </FilterBox>
          <FilterBox title="Periodo" accent="#0ea5e9">
            <div style={{ textAlign: "center", fontSize: 12, fontStyle: "italic", color: "#334155", padding: "4px 0" }}>
              <strong>da</strong> 07/10/2021 <strong>a</strong> 30/06/2030
            </div>
          </FilterBox>
          <FilterBox title="Attività" accent="#0ea5e9">
            <Chips values={slicers.attivita} />
          </FilterBox>
          <FilterBox title="Tipologia" accent="#0ea5e9">
            <Chips values={slicers.tipologia} />
          </FilterBox>
        </div>

        <FilterBox title="PRARU" accent="#f59e0b" big>
          <div className="cr-sub-grid-2">
            <div>
              <div className="cr-lbl">Obiettivo Generale</div>
              <Chips values={slicers.obiettivo_generale} />
            </div>
            <div>
              <div className="cr-lbl">Obiettivi Specifici</div>
              <Chips values={slicers.obiettivi_specifici} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="cr-lbl">Azioni</div>
              <Chips values={slicers.azioni} />
            </div>
          </div>
        </FilterBox>

        <FilterBox title="Territorio" accent="#16a34a" big>
          <div className="cr-sub-grid-2">
            <div>
              <div className="cr-lbl">Superficie</div>
              <Chips values={slicers.superficie} />
            </div>
            <div>
              <div className="cr-lbl">Area Tematica</div>
              <Chips values={slicers.area_tematica} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="cr-lbl">Unità d&apos;Intervento</div>
              <Chips values={slicers.unita_intervento} />
            </div>
          </div>
        </FilterBox>
      </div>

      <FilterBox title="Procedimento Amministrativo" accent="#2563eb" italic>
        <div className="cr-sub-grid-5">
          <div>
            <div className="cr-lbl">Stato Proc.Amm-vo</div>
            <Chips values={slicers.stato_proc} />
          </div>
          <div>
            <div className="cr-lbl">CONTRATTO</div>
            <Chips values={slicers.contratto} />
          </div>
          <div>
            <div className="cr-lbl">Oggetto</div>
            <Chips values={slicers.oggetto} />
          </div>
          <div>
            <div className="cr-lbl">Livello</div>
            <Chips values={slicers.livello} />
          </div>
          <div>
            <div className="cr-lbl">Sub Livello</div>
            <Chips values={slicers.sub_livello} />
          </div>
        </div>
      </FilterBox>

      {/* ======= TASK TABLE ======= */}
      <TaskTable tasks={tasks} />
    </AdminSheetLayout>
  );
}

function FilterBox({
  title,
  accent,
  children,
  big,
  italic,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  big?: boolean;
  italic?: boolean;
}) {
  return (
    <div
      className={"cr-filter-box" + (big ? " big" : "") + (italic ? " italic" : "")}
      style={{ borderColor: accent, marginBottom: italic ? 14 : 0 }}
    >
      <div
        className="cr-filter-head"
        style={{ background: accent + "15", color: accent, borderBottomColor: accent + "50" }}
      >
        <span>{title}</span>
        <i className="fas fa-filter" style={{ fontSize: 9, opacity: 0.6 }}></i>
      </div>
      <div className="cr-filter-body">{children}</div>
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) {
    return (
      <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
        (nessun valore)
      </span>
    );
  }
  return (
    <div className="cr-chips">
      {values.map((v) => (
        <span key={v} className="cr-chip" title={v}>
          {v}
        </span>
      ))}
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  const dash = (p / 100) * c;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#16a34a"
        strokeWidth="12"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 50 50)"
        strokeLinecap="round"
      />
      <text x="50" y="56" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">
        {p.toFixed(2).replace(".", ",")}%
      </text>
    </svg>
  );
}

// ===================== TASK TABLE =====================
const HORIZON_START = new Date("2021-10-07");
const HORIZON_END = new Date("2030-06-30");
const HORIZON_DAYS = (HORIZON_END.getTime() - HORIZON_START.getTime()) / 86400000;

function TaskTable({ tasks }: { tasks: Task[] }) {
  const months: { label: string; pct: number; isYear: boolean; year?: number }[] = [];
  const MONTHS_ABBR = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const cur = new Date(HORIZON_START);
  while (cur <= HORIZON_END) {
    const pct = ((cur.getTime() - HORIZON_START.getTime()) / 86400000) / HORIZON_DAYS * 100;
    months.push({
      label: `${MONTHS_ABBR[cur.getMonth()]}-${String(cur.getFullYear()).slice(2)}`,
      pct,
      isYear: cur.getMonth() === 0,
      year: cur.getFullYear(),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  const today = new Date();
  const todayPct = Math.min(100, Math.max(0, ((today.getTime() - HORIZON_START.getTime()) / 86400000) / HORIZON_DAYS * 100));

  return (
    <div className="cr-tasktbl-wrap">
      <div className="cr-tasktbl-head">
        <i className="fas fa-list-check" style={{ color: "#2563eb" }}></i>
        Tabella Attività Cruscotto ({tasks.length} righe) — scrolla orizzontale per Gantt completo
      </div>

      <div className="cr-tasktbl-scroll">
        <div className="cr-tasktbl">
          <div className="cr-row-head">
            <div className="cr-cell h">% Avanz.</div>
            <div className="cr-cell h">ID</div>
            <div className="cr-cell h">Attività</div>
            <div className="cr-cell h">Inizio</div>
            <div className="cr-cell h">Fine</div>
            <div className="cr-cell h" style={{ textAlign: "right" }}>Durata</div>
            <div className="cr-cell h" style={{ position: "relative" }}>
              <div style={{ position: "relative", height: 14 }}>
                {months.filter((m) => m.isYear).map((m) => (
                  <span
                    key={m.label}
                    style={{
                      position: "absolute",
                      left: `${m.pct}%`,
                      fontSize: 9,
                      fontWeight: 800,
                      color: "#0ea5e9",
                      transform: "translateX(-50%)",
                    }}
                  >
                    {m.year}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {tasks.map((t) => {
            const color = colorForMacro(t.obiettivo_generale);
            const pct = (t.pct_avanzamento ?? 0) * 100;
            return (
              <div key={t.id} className="cr-row">
                <div
                  className="cr-cell"
                  style={{
                    background: "#fce7f3",
                    textAlign: "right",
                    fontWeight: 800,
                    color: pct >= 50 ? "#16a34a" : pct > 0 ? "#9f1239" : "#94a3b8",
                    fontFamily: "ui-monospace,monospace",
                  }}
                >
                  {pct.toFixed(2).replace(".", ",")}%
                </div>
                <div
                  className="cr-cell"
                  style={{
                    fontFamily: "ui-monospace,monospace",
                    fontWeight: 700,
                    textAlign: "center",
                    background: "#eef2ff",
                  }}
                >
                  {t.id_crono}
                </div>
                <div className="cr-cell">
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 6px",
                      background: color + "22",
                      color,
                      borderRadius: 3,
                      fontWeight: 700,
                      fontSize: 10,
                      marginRight: 5,
                    }}
                  >
                    {short(t.obiettivo_generale)}
                  </span>
                  <span style={{ fontSize: 10, color: "#475569" }}>
                    {short(t.obiettivi_specifici)} · {short(t.superficie)}
                  </span>
                </div>
                <div className="cr-cell" style={{ fontFamily: "ui-monospace,monospace" }}>
                  {formatDateShort(t.inizio)}
                </div>
                <div className="cr-cell" style={{ fontFamily: "ui-monospace,monospace" }}>
                  {formatDateShort(t.fine)}
                </div>
                <div className="cr-cell" style={{ textAlign: "right", fontFamily: "ui-monospace,monospace" }}>
                  {t.durata_giorni}
                </div>
                <div className="cr-cell cr-gantt-cell">
                  <GanttBar task={t} color={color} todayPct={todayPct} />
                </div>
              </div>
            );
          })}

          <div className="cr-row-head" style={{ top: "auto", borderTop: "2px solid #cbd5e1", borderBottom: 0, fontSize: 8, padding: 0 }}>
            <div className="cr-cell h" style={{ gridColumn: "1 / span 6", textAlign: "right", fontStyle: "italic" }}>
              Orizzonte →
            </div>
            <div className="cr-cell h" style={{ position: "relative", height: 20 }}>
              {months.filter((_, i) => i % 3 === 0).map((m) => (
                <span
                  key={m.label}
                  style={{
                    position: "absolute",
                    left: `${m.pct}%`,
                    top: 4,
                    fontSize: 8,
                    transform: "translateX(-50%)",
                    color: m.isYear ? "#0ea5e9" : "#64748b",
                    fontWeight: m.isYear ? 700 : 400,
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttBar({ task, color, todayPct }: { task: Task; color: string; todayPct: number }) {
  if (!task.inizio || !task.fine) return null;
  const d0 = new Date(task.inizio).getTime();
  const d1 = new Date(task.fine).getTime();
  const left = Math.max(0, ((d0 - HORIZON_START.getTime()) / 86400000) / HORIZON_DAYS * 100);
  const width = Math.max(0.3, ((d1 - d0) / 86400000) / HORIZON_DAYS * 100);
  const pct = (task.pct_avanzamento ?? 0) * 100;
  return (
    <div className="cr-gantt-bar-outer">
      <div
        style={{
          position: "absolute",
          left: `${todayPct}%`,
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: "1px dashed #ef4444",
          zIndex: 2,
        }}
      />
      <div
        title={`${task.inizio} → ${task.fine} (${pct.toFixed(2)}%)`}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          top: 2,
          bottom: 2,
          background: color + "33",
          border: `1px solid ${color}`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function short(s: string | null): string {
  if (!s) return "–";
  return s.replace("(vuoto)", "–");
}

function colorForMacro(m: string | null): string {
  if (!m) return "#64748b";
  if (m.includes("Risanamento")) return "#16a34a";
  if (m.includes("Rigenerazione")) return "#2563eb";
  if (m.includes("Infrastru")) return "#f59e0b";
  if (m.toLowerCase().includes("trasv") || m.includes("Altro")) return "#7c3aed";
  return "#64748b";
}
