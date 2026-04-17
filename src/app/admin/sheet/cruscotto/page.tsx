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
      subtitle="Replica dashboard Excel «Cruscotto» — confronto 1:1 con i valori del file originale"
    >
      {/* ======= QUADRO SINOTTICO (Header + KPI + Map) ======= */}
      <div
        style={{
          background: "#dce6cc",
          border: "2px solid #7a8f5a",
          borderRadius: 6,
          padding: 14,
          marginBottom: 14,
          display: "grid",
          gridTemplateColumns: "160px 1fr 320px 1fr 240px",
          gap: 10,
          alignItems: "stretch",
        }}
      >
        {/* Stemma + Struttura di Supporto */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "#fff",
              border: "2px solid #7a8f5a",
              display: "grid",
              placeItems: "center",
              color: "#7a8f5a",
              fontSize: 30,
            }}
          >
            <i className="fas fa-landmark"></i>
          </div>
          <div style={{ fontSize: 8, color: "#1e293b", textAlign: "center", lineHeight: 1.3 }}>
            <strong>Commissariato</strong>
            <br />
            Bonifica Bagnoli Coroglio
          </div>
        </div>

        {/* Info Commissario */}
        <div style={{ fontSize: 10, color: "#1e293b", lineHeight: 1.55, alignSelf: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#0f172a" }}>
            Commissario Straordinario del Governo per la bonifica ambientale e rigenerazione urbana del sito di interesse nazionale Bagnoli Coroglio
          </div>
          <div><strong>Commissario:</strong> Prof. G. MANFREDI (Sindaco di Napoli)</div>
          <div><strong>Sub Commissari:</strong> Prof. F. De Rossi – Notaio D. Falconio</div>
          <div><strong>Dirigenti:</strong> Dott. A. Auricchio – Ing. G. Napolitano</div>
        </div>

        {/* Title box */}
        <div
          style={{
            background: "linear-gradient(180deg, #fff9d6 0%, #ffec9c 100%)",
            border: "2px solid #d4a63c",
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            padding: 12,
            fontWeight: 800,
            color: "#0f172a",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 22, lineHeight: 1.1 }}>Monitoraggio Attività</div>
            <div style={{ fontSize: 26, color: "#000", marginTop: 4 }}>
              SIN <span style={{ fontWeight: 900 }}>Bagnoli Coroglio</span>
            </div>
          </div>
        </div>

        {/* Donut + Avanzamento */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#fff9d6",
              border: "2px solid #d4a63c",
              borderRadius: 6,
              padding: 8,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 2 }}>
              % Giorni completati
            </div>
            <Donut pct={kpi.pctGiorni} />
          </div>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#0ea5e9",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Avanzamento Attività
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                border: "1px solid #0284c7",
                borderRadius: 4,
                overflow: "hidden",
                fontSize: 10,
                fontWeight: 700,
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              <div style={{ padding: "2px 4px", borderRight: "1px solid #0284c7" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#ef4444", marginRight: 3 }} />
                Non iniziati
              </div>
              <div style={{ padding: "2px 4px", borderRight: "1px solid #0284c7" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#60a5fa", marginRight: 3 }} />
                In avanzamento
              </div>
              <div style={{ padding: "2px 4px" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#16a34a", marginRight: 3 }} />
                Completati
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 0 }}>
              <StatBox color="#ef4444" value={kpi.notStarted} />
              <StatBox color="#60a5fa" value={kpi.inProgress} big />
              <StatBox color="#16a34a" value={kpi.completed} />
            </div>
          </div>
        </div>

        {/* Mappa SIN + Milestone count */}
        <div
          style={{
            background: "#fff",
            border: "2px solid #0284c7",
            borderRadius: 6,
            padding: 8,
            textAlign: "center",
            fontSize: 11,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 700, color: "#0369a1", fontSize: 12 }}>
            SIN Bagnoli Coroglio
          </div>
          <svg width="100%" height="80" viewBox="0 0 200 80" style={{ display: "block" }}>
            {/* schizzo stilizzato dell'area */}
            <defs>
              <pattern id="sea" width="12" height="12" patternUnits="userSpaceOnUse">
                <rect width="12" height="12" fill="#bae6fd" />
                <circle cx="6" cy="6" r="1" fill="#0ea5e9" opacity=".4" />
              </pattern>
            </defs>
            <rect x="0" y="55" width="200" height="25" fill="url(#sea)" />
            <path d="M0 55 Q50 45, 100 50 T200 48 L200 55 Z" fill="#c9d9b7" stroke="#7a8f5a" strokeWidth="1" />
            <path d="M40 40 L60 30 L90 32 L110 25 L140 28 L170 35 L190 45" fill="none" stroke="#7a8f5a" strokeWidth="1.5" />
            <circle cx="110" cy="50" r="3" fill="#ef4444" />
          </svg>
          <div style={{ fontSize: 10, color: "#334155", display: "flex", justifyContent: "space-around" }}>
            <span><strong style={{ color: "#f59e0b" }}>{slicers.n_milestone}</strong> MILESTONE</span>
            <span><strong style={{ color: "#7c3aed" }}>{slicers.n_interconnessioni}</strong> Interconness.</span>
          </div>
        </div>
      </div>

      {/* ======= SLICER BAR (replica filtri Excel) ======= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {/* Colonna 1: Ambito + Periodo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FilterBox title="Ambito" accent="#16a34a">
            <Chips values={slicers.ambito} />
          </FilterBox>
          <FilterBox title="Periodo" accent="#0ea5e9">
            <div style={{ textAlign: "center", fontSize: 13, fontStyle: "italic", color: "#334155", padding: "6px 0" }}>
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

        {/* Colonna 2: PRARU (Obiettivo Generale / Specifici / Azioni) */}
        <FilterBox title="PRARU" accent="#f59e0b" big>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <Lbl>Obiettivo Generale</Lbl>
              <Chips values={slicers.obiettivo_generale} />
            </div>
            <div>
              <Lbl>Obiettivi Specifici</Lbl>
              <Chips values={slicers.obiettivi_specifici} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <Lbl>Azioni</Lbl>
              <Chips values={slicers.azioni} />
            </div>
          </div>
        </FilterBox>

        {/* Colonna 3: Territorio */}
        <FilterBox title="Territorio" accent="#16a34a" big>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <Lbl>Superficie</Lbl>
              <Chips values={slicers.superficie} />
            </div>
            <div>
              <Lbl>Area Tematica</Lbl>
              <Chips values={slicers.area_tematica} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <Lbl>Unità d&apos;Intervento</Lbl>
              <Chips values={slicers.unita_intervento} />
            </div>
          </div>
        </FilterBox>
      </div>

      {/* Procedimento Amministrativo - riga dedicata */}
      <FilterBox title="Procedimento Amministrativo" accent="#2563eb" italic>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          <div>
            <Lbl>Stato Proc.Amm-vo</Lbl>
            <Chips values={slicers.stato_proc} />
          </div>
          <div>
            <Lbl>CONTRATTO</Lbl>
            <Chips values={slicers.contratto} />
          </div>
          <div>
            <Lbl>Oggetto</Lbl>
            <Chips values={slicers.oggetto} />
          </div>
          <div>
            <Lbl>Livello</Lbl>
            <Chips values={slicers.livello} />
          </div>
          <div>
            <Lbl>Sub Livello</Lbl>
            <Chips values={slicers.sub_livello} />
          </div>
        </div>
      </FilterBox>

      {/* ======= TASK TABLE CON GANTT BARS ======= */}
      <TaskTable tasks={tasks} />
    </AdminSheetLayout>
  );
}

// =============== COMPONENTS ===============

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
      style={{
        background: "#fff",
        border: `1px solid ${accent}`,
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
        marginBottom: italic ? 14 : 0,
      }}
    >
      <div
        style={{
          background: accent + "15",
          padding: "5px 10px",
          borderBottom: `1px solid ${accent}50`,
          fontSize: 11,
          fontWeight: 800,
          color: accent,
          textTransform: italic ? "none" : "uppercase",
          letterSpacing: italic ? 0 : ".5px",
          fontStyle: italic ? "italic" : "normal",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        <i className="fas fa-filter" style={{ fontSize: 9, opacity: 0.6 }}></i>
      </div>
      <div style={{ padding: big ? 10 : 8 }}>{children}</div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: "#64748b",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".3px",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {values.map((v) => (
        <span
          key={v}
          style={{
            display: "inline-block",
            padding: "2px 8px",
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 4,
            fontSize: 10,
            color: "#1e293b",
            whiteSpace: "nowrap",
            maxWidth: 170,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={v}
        >
          {v}
        </span>
      ))}
      {values.length === 0 && (
        <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
          (nessun valore)
        </span>
      )}
    </div>
  );
}

function StatBox({
  color,
  value,
  big,
}: {
  color: string;
  value: number;
  big?: boolean;
}) {
  return (
    <div
      style={{
        background: color,
        color: "#fff",
        padding: big ? "10px 4px" : "10px 4px",
        textAlign: "center",
        fontWeight: 900,
        borderRight: "1px solid rgba(255,255,255,.3)",
      }}
    >
      <div style={{ fontSize: big ? 36 : 26, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  const dash = (p / 100) * c;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke="#16a34a"
        strokeWidth="12"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 55 55)"
        strokeLinecap="round"
      />
      <text x="55" y="61" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0f172a">
        {p.toFixed(2).replace(".", ",")}%
      </text>
    </svg>
  );
}

// Task table con Gantt
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

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid var(--border)",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <i className="fas fa-list-check" style={{ color: "#2563eb" }}></i>
        Tabella Attività Cruscotto ({tasks.length} righe)
      </div>

      <div style={{ overflow: "auto", maxHeight: "60vh" }}>
        <div style={{ minWidth: 1600 }}>
          {/* Header mesi */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 80px 2fr 90px 90px 80px 1fr",
              background: "#eaeff7",
              borderBottom: "2px solid #cbd5e1",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              color: "#334155",
              position: "sticky",
              top: 0,
              zIndex: 3,
            }}
          >
            <Th>% Avanz.</Th>
            <Th>ID</Th>
            <Th>Attività</Th>
            <Th>Inizio</Th>
            <Th>Fine</Th>
            <Th style={{ textAlign: "right" }}>Durata</Th>
            <Th style={{ position: "relative" }}>
              <div style={{ position: "relative", height: 16 }}>
                {months.map((m) =>
                  m.isYear ? (
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
                  ) : null
                )}
              </div>
            </Th>
          </div>

          {tasks.map((t) => {
            const color = colorForMacro(t.obiettivo_generale);
            const pct = (t.pct_avanzamento ?? 0) * 100;
            return (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 80px 2fr 90px 90px 80px 1fr",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: 11,
                  alignItems: "center",
                  minHeight: 26,
                }}
              >
                <Td
                  style={{
                    background: "#fce7f3",
                    textAlign: "right",
                    fontWeight: 800,
                    color: pct >= 50 ? "#16a34a" : pct > 0 ? "#9f1239" : "#94a3b8",
                    fontFamily: "ui-monospace,monospace",
                  }}
                >
                  {pct.toFixed(2).replace(".", ",")}%
                </Td>
                <Td
                  style={{
                    fontFamily: "ui-monospace,monospace",
                    fontWeight: 700,
                    textAlign: "center",
                    background: "#eef2ff",
                  }}
                >
                  {t.id_crono}
                </Td>
                <Td>
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
                </Td>
                <Td style={{ fontFamily: "ui-monospace,monospace" }}>
                  {formatDateShort(t.inizio)}
                </Td>
                <Td style={{ fontFamily: "ui-monospace,monospace" }}>
                  {formatDateShort(t.fine)}
                </Td>
                <Td style={{ textAlign: "right", fontFamily: "ui-monospace,monospace" }}>
                  {t.durata_giorni}
                </Td>
                <Td style={{ padding: 3, position: "relative", background: "#fafbff" }}>
                  <GanttBar task={t} color={color} />
                </Td>
              </div>
            );
          })}

          {/* Footer months */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 80px 2fr 90px 90px 80px 1fr",
              background: "#eaeff7",
              borderTop: "2px solid #cbd5e1",
              fontSize: 8,
              color: "#64748b",
            }}
          >
            <div style={{ gridColumn: "1 / span 6", padding: "4px 10px", textAlign: "right", fontStyle: "italic" }}>
              Orizzonte Gantt →
            </div>
            <div style={{ position: "relative", height: 20 }}>
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

function GanttBar({ task, color }: { task: Task; color: string }) {
  if (!task.inizio || !task.fine) return null;
  const d0 = new Date(task.inizio).getTime();
  const d1 = new Date(task.fine).getTime();
  const left = Math.max(0, ((d0 - HORIZON_START.getTime()) / 86400000) / HORIZON_DAYS * 100);
  const width = Math.max(0.3, ((d1 - d0) / 86400000) / HORIZON_DAYS * 100);
  const pct = (task.pct_avanzamento ?? 0) * 100;
  const today = new Date();
  const todayPct = Math.min(100, Math.max(0, ((today.getTime() - HORIZON_START.getTime()) / 86400000) / HORIZON_DAYS * 100));
  return (
    <div
      style={{
        position: "relative",
        height: 18,
        background: "#e2e8f0",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* OGGI line */}
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
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRight: "1px solid #cbd5e1",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: "4px 10px",
        borderRight: "1px solid #f1f5f9",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
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
