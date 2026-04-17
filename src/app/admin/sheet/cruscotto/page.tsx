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

async function loadData() {
  const tasks = await q<Task>(
    `SELECT id, id_crono, obiettivo_generale, obiettivi_specifici, azioni, sub_ambito,
            superficie, area_tematica, unita_intervento, tipologia, attivita,
            inizio::text AS inizio, fine::text AS fine,
            durata_giorni, pct_avanzamento::float AS pct_avanzamento, row_idx
       FROM bagnoli_cantieri.cruscotto_task ORDER BY row_idx;`
  );
  return tasks;
}

// Calcola KPI come Excel
// Periodo fisso da Excel: "da 07/10/2021 a 30/06/2030"
const PERIODO_INIZIO = new Date("2021-10-07");
const PERIODO_FINE = new Date("2030-06-30");

function calcKpi(tasks: Task[]) {
  const n = tasks.length;
  const notStarted = tasks.filter((t) => !t.pct_avanzamento).length;
  const inProgress = tasks.filter((t) => t.pct_avanzamento && t.pct_avanzamento > 0 && t.pct_avanzamento < 1).length;
  const completed = tasks.filter((t) => t.pct_avanzamento && t.pct_avanzamento >= 1).length;
  // % giorni completati = (oggi - inizio periodo) / (fine periodo - inizio periodo)
  // come mostra Excel nel donut (51,85% ad aprile 2026)
  const today = new Date();
  const totDays = (PERIODO_FINE.getTime() - PERIODO_INIZIO.getTime()) / 86400000;
  const elapsed = (today.getTime() - PERIODO_INIZIO.getTime()) / 86400000;
  const pctGiorni = Math.min(100, Math.max(0, (elapsed / totDays) * 100));
  return { n, notStarted, inProgress, completed, pctGiorni };
}

function uniqueVals(tasks: Task[], key: keyof Task): string[] {
  const set = new Set<string>();
  tasks.forEach((t) => {
    const v = t[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") set.add(String(v));
  });
  return [...set].sort();
}

// Mini-Gantt bar: posizione relativa su orizzonte 2021-10 → 2030-06
const HORIZON_START = new Date("2021-10-07");
const HORIZON_END = new Date("2030-06-30");
const HORIZON_DAYS = (HORIZON_END.getTime() - HORIZON_START.getTime()) / (1000 * 60 * 60 * 24);

function barStyle(t: Task): React.CSSProperties {
  if (!t.inizio || !t.fine) return { display: "none" };
  const d0 = new Date(t.inizio).getTime();
  const d1 = new Date(t.fine).getTime();
  const startDays = (d0 - HORIZON_START.getTime()) / (1000 * 60 * 60 * 24);
  const endDays = (d1 - HORIZON_START.getTime()) / (1000 * 60 * 60 * 24);
  const left = Math.max(0, (startDays / HORIZON_DAYS) * 100);
  const width = Math.max(0.3, ((endDays - startDays) / HORIZON_DAYS) * 100);
  return { left: `${left}%`, width: `${width}%` };
}

export default async function CruscottoPage() {
  const tasks = await loadData();
  const kpi = calcKpi(tasks);

  const filtri = {
    ambito: uniqueVals(tasks, "sub_ambito"),
    obiettivoGenerale: uniqueVals(tasks, "obiettivo_generale"),
    obiettivoSpecifico: uniqueVals(tasks, "obiettivi_specifici"),
    azioni: uniqueVals(tasks, "azioni"),
    superficie: uniqueVals(tasks, "superficie"),
    areaTematica: uniqueVals(tasks, "area_tematica"),
    unitaIntervento: uniqueVals(tasks, "unita_intervento"),
    tipologia: uniqueVals(tasks, "tipologia"),
    attivita: uniqueVals(tasks, "attivita"),
  };

  // Mesi per header timeline
  const months: { label: string; pct: number }[] = [];
  const cur = new Date(HORIZON_START);
  while (cur <= HORIZON_END) {
    const m = cur.getMonth();
    const y = cur.getFullYear();
    const MONTHS_ABBR = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    months.push({
      label: `${MONTHS_ABBR[m]}-${String(y).slice(2)}`,
      pct: ((cur.getTime() - HORIZON_START.getTime()) / (HORIZON_END.getTime() - HORIZON_START.getTime())) * 100,
    });
    cur.setMonth(m + 1);
  }

  return (
    <AdminSheetLayout
      active="cruscotto"
      title="Cruscotto"
      subtitle="Dashboard di monitoraggio — replica dello sheet Excel «Cruscotto»"
    >
      {/* Testata Commissario */}
      <div
        style={{
          background: "#c9d9b7",
          border: "1px solid #9bb477",
          padding: 20,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 20,
          alignItems: "center",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        {/* Stemma */}
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            background: "#fff",
            border: "2px solid #7a8f5a",
            display: "grid",
            placeItems: "center",
            fontSize: 30,
            color: "#7a8f5a",
          }}
        >
          <i className="fas fa-landmark"></i>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#1f2937", fontWeight: 600 }}>
            Commissario Straordinario del Governo per la bonifica ambientale e rigenerazione urbana del sito di interesse nazionale Bagnoli Coroglio
          </div>
          <div style={{ fontSize: 10, marginTop: 8, color: "#334155", lineHeight: 1.6 }}>
            <div>
              <strong>Commissario:</strong> Prof. G. MANFREDI (Sindaco di Napoli)
            </div>
            <div>
              <strong>Sub Commissari:</strong> Prof. F. De Rossi – Notaio D. Falconio
            </div>
            <div>
              <strong>Dirigenti:</strong> Dott. A. Auricchio – Ing. G. Napolitano
            </div>
          </div>
        </div>
        {/* Title */}
        <div
          style={{
            background: "#fff7cc",
            border: "1px solid #e5c76b",
            padding: "14px 22px",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
            Monitoraggio Attività
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            SIN <span style={{ color: "#000" }}>Bagnoli Coroglio</span>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr 240px",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Donut % giorni completati */}
        <div
          style={{
            background: "#fff7cc",
            border: "1px solid #e5c76b",
            padding: 16,
            borderRadius: 8,
            textAlign: "center",
            minWidth: 180,
          }}
        >
          <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>
            % Giorni completati
          </div>
          <Donut pct={kpi.pctGiorni} />
        </div>

        {/* Avanzamento Attività */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            padding: 14,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 18, color: "#0ea5e9", fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Avanzamento Attività
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 2,
              alignItems: "stretch",
            }}
          >
            <StatBox color="#ef4444" label="Non iniziati" value={kpi.notStarted} />
            <StatBox color="#60a5fa" label="In avanzamento" value={kpi.inProgress} />
            <StatBox color="#16a34a" label="Completati" value={kpi.completed} />
          </div>
        </div>

        {/* Periodo */}
        <div
          style={{
            background: "#c9d9b7",
            border: "1px solid #9bb477",
            padding: 14,
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, color: "#1e293b", fontWeight: 700, marginBottom: 6 }}>
            Periodo
          </div>
          <div style={{ fontSize: 13, color: "#334155", fontStyle: "italic" }}>
            da 07/10/2021 a 30/06/2030
          </div>
        </div>
      </div>

      {/* Slicer Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Panel title="PRARU" accent="#f59e0b">
          <Slicer label="Obiettivo Generale" values={filtri.obiettivoGenerale} />
          <Slicer label="Obiettivi Specifici" values={filtri.obiettivoSpecifico} />
          <Slicer label="Azioni" values={filtri.azioni} />
          <Slicer label="Ambito" values={filtri.ambito} />
        </Panel>
        <Panel title="Territorio" accent="#16a34a">
          <Slicer label="Superficie" values={filtri.superficie} />
          <Slicer label="Area Tematica" values={filtri.areaTematica} />
          <Slicer label="Unità d'Intervento" values={filtri.unitaIntervento} />
          <Slicer label="Tipologia" values={filtri.tipologia} />
        </Panel>
        <Panel title="Procedimento Amministrativo" accent="#2563eb">
          <Slicer label="Attività" values={filtri.attivita} />
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              lineHeight: 1.6,
              marginTop: 10,
              padding: 8,
              background: "#f8fafc",
              borderRadius: 6,
            }}
          >
            Totale <strong>{kpi.n}</strong> attività registrate · orizzonte 2021–2030
            <br />
            Media % avanzamento: <strong>{kpi.pctGiorni.toFixed(2).replace(".", ",")}%</strong>
          </div>
        </Panel>
      </div>

      {/* Task table con mini-Gantt */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700 }}>
          <i className="fas fa-list-check" style={{ marginRight: 8, color: "#2563eb" }}></i>
          Tabella attività Cruscotto ({tasks.length} righe)
        </div>

        {/* Header mesi scroll-sync */}
        <div style={{ overflow: "auto", position: "relative" }}>
          <div style={{ minWidth: 1400 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 2fr 1.3fr 1fr 1fr 100px 100px 90px 80px 1fr",
                gap: 0,
                background: "#f1f5f9",
                borderBottom: "2px solid #cbd5e1",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#64748b",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}
            >
              <Th>ID</Th>
              <Th>Obiettivo</Th>
              <Th>Superficie</Th>
              <Th>Area Tem.</Th>
              <Th>Unità</Th>
              <Th>Inizio</Th>
              <Th>Fine</Th>
              <Th style={{ textAlign: "right" }}>Durata</Th>
              <Th style={{ textAlign: "right" }}>% Avanz.</Th>
              <Th>Gantt</Th>
            </div>

            {tasks.map((t) => {
              const pct = (t.pct_avanzamento ?? 0) * 100;
              const st = barStyle(t);
              const color = colorForMacro(t.obiettivo_generale);
              return (
                <div
                  key={t.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 2fr 1.3fr 1fr 1fr 100px 100px 90px 80px 1fr",
                    gap: 0,
                    borderBottom: "1px solid #f1f5f9",
                    fontSize: 12,
                    alignItems: "center",
                  }}
                >
                  <Td bg="#eef2ff" mono>
                    {t.id_crono}
                  </Td>
                  <Td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: color + "22",
                        color,
                        fontWeight: 700,
                        fontSize: 11,
                        marginRight: 6,
                      }}
                    >
                      {short(t.obiettivo_generale)}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      {short(t.obiettivi_specifici)} · {short(t.azioni)}
                    </span>
                  </Td>
                  <Td>{t.superficie ?? "–"}</Td>
                  <Td>{t.area_tematica ?? "–"}</Td>
                  <Td>{t.unita_intervento ?? "–"}</Td>
                  <Td>{formatDateShort(t.inizio)}</Td>
                  <Td>{formatDateShort(t.fine)}</Td>
                  <Td style={{ textAlign: "right", fontFamily: "monospace" }}>
                    {t.durata_giorni ?? "–"}
                  </Td>
                  <Td
                    style={{
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: pct >= 100 ? "#16a34a" : pct > 0 ? "#2563eb" : "#ef4444",
                    }}
                  >
                    {pct.toFixed(2).replace(".", ",")}%
                  </Td>
                  <Td style={{ padding: 4, position: "relative", background: "#fafbff" }}>
                    <div
                      style={{
                        position: "relative",
                        height: 16,
                        background: "#e2e8f0",
                        borderRadius: 2,
                      }}
                    >
                      <div
                        title={`${t.inizio} → ${t.fine}`}
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          background: `linear-gradient(to right, ${color} ${pct}%, ${color}66 ${pct}%)`,
                          border: `1px solid ${color}`,
                          borderRadius: 2,
                          ...st,
                        }}
                      />
                    </div>
                  </Td>
                </div>
              );
            })}

            {/* Timeline footer coi mesi */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 2fr 1.3fr 1fr 1fr 100px 100px 90px 80px 1fr",
                gap: 0,
                background: "#f8fafc",
                borderTop: "2px solid #cbd5e1",
                fontSize: 9,
                color: "#64748b",
                padding: "4px 0",
              }}
            >
              <div style={{ gridColumn: "1 / span 9", padding: "0 8px" }}>
                Periodo Gantt (asse orizzontale):
              </div>
              <div style={{ position: "relative", height: 18 }}>
                {months.filter((_, i) => i % 3 === 0).map((m) => (
                  <div
                    key={m.label}
                    style={{
                      position: "absolute",
                      left: `${m.pct}%`,
                      fontSize: 8,
                      color: "#64748b",
                      whiteSpace: "nowrap",
                      transform: "translateX(-50%)",
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminSheetLayout>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: accent + "18",
          color: accent,
          padding: "8px 14px",
          fontWeight: 800,
          fontSize: 13,
          borderBottom: `2px solid ${accent}`,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Slicer({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: "inline-block",
              padding: "3px 8px",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: 10,
              color: "#334155",
              background: "#f8fafc",
            }}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatBox({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div
      style={{
        background: color,
        color: "#fff",
        padding: "16px 8px",
        textAlign: "center",
        fontWeight: 800,
      }}
    >
      <div style={{ fontSize: 30, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, opacity: 0.9 }}>{label}</div>
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  const dash = (p / 100) * c;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth="14" />
      <circle
        cx="65"
        cy="65"
        r={r}
        fill="none"
        stroke="#16a34a"
        strokeWidth="14"
        strokeDasharray={`${dash} ${c}`}
        strokeDashoffset="0"
        transform="rotate(-90 65 65)"
        strokeLinecap="round"
      />
      <text x="65" y="72" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0f172a">
        {p.toFixed(2).replace(".", ",")}%
      </text>
    </svg>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRight: "1px solid #e2e8f0",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Td({
  children,
  style,
  bg,
  mono,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  bg?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRight: "1px solid #f1f5f9",
        background: bg,
        fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : undefined,
        fontSize: mono ? 11 : 12,
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
