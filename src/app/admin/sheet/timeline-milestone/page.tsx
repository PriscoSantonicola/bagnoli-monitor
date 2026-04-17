import { q } from "@/lib/db";
import { AdminSheetLayout } from "@/components/AdminSheetLayout";
import { formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MilestoneRow = {
  id: number;
  obiettivo_generale: string | null;
  obiettivi_specifici: string | null;
  azioni: string | null;
  superficie: string | null;
  id_task: string | null;
  data_milestone: string | null;
  posizione: number | null;
  etichetta: string | null;
};

async function loadMilestones() {
  return q<MilestoneRow>(`
    SELECT id, obiettivo_generale, obiettivi_specifici, azioni, superficie,
           id_task, data_milestone::text AS data_milestone, posizione, etichetta
      FROM bagnoli_cantieri.milestone_point
      ORDER BY data_milestone, posizione;
  `);
}

// Orizzonte timeline: copre le milestone (2021-10 → 2027-12)
const T_START = new Date("2021-09-01");
const T_END = new Date("2027-12-31");
const T_MS = T_END.getTime() - T_START.getTime();

function xFromDate(d: string): number {
  const t = new Date(d).getTime();
  return ((t - T_START.getTime()) / T_MS) * 100;
}

function monthLabel(d: Date): string {
  const mesi = ["g", "f", "m", "a", "m", "g", "l", "a", "s", "o", "n", "d"];
  return `${mesi[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

export default async function Page() {
  const rows = await loadMilestones();
  const today = new Date();

  // Separa: posizione > 0 → sopra timeline (Risanamento); posizione < 0 → sotto (Realizzazione)
  const above = rows.filter((r) => (r.posizione ?? 0) > 0);
  const below = rows.filter((r) => (r.posizione ?? 0) < 0);

  // Scala posizione: valori in [-150, 130] normalizzati
  const maxAbove = Math.max(...above.map((r) => r.posizione ?? 0), 1);
  const maxBelow = Math.abs(Math.min(...below.map((r) => r.posizione ?? 0), -1));

  const SVG_W = 2200;
  const SVG_H = 700;
  const MID = SVG_H / 2;

  // Genera label mesi
  const months: { x: number; label: string; isFirstOfYear: boolean }[] = [];
  const cur = new Date(T_START);
  while (cur <= T_END) {
    const x = ((cur.getTime() - T_START.getTime()) / T_MS) * SVG_W;
    months.push({ x, label: monthLabel(cur), isFirstOfYear: cur.getMonth() === 0 });
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <AdminSheetLayout
      active="timeline-milestone"
      title="Timeline - MILESTONE"
      subtitle={`Replica sheet Excel MILESTONE — ${rows.length} milestone · marker OGGI ${formatDateShort(today.toISOString())}`}
    >
      {/* Header info */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          marginBottom: 14,
          display: "flex",
          gap: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong>Tipologia:</strong> MILESTONE *
        </div>
        <div>
          <strong>OGGI:</strong> {formatDateShort(today.toISOString())}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 12 }}>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#16a34a",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            Risanamento ({above.length})
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: "#2563eb",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            Realizzazione ({below.length})
          </span>
        </div>
      </div>

      {/* SVG Timeline */}
      <div className="ms-timeline-wrap">
        <div className="ms-badge">Milestone</div>

        <svg
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: "block" }}
        >
          {/* Asse orizzontale centrale */}
          <line
            x1={0}
            y1={MID}
            x2={SVG_W}
            y2={MID}
            stroke="#1e293b"
            strokeWidth={2}
          />

          {/* Labels mesi */}
          {months.map((m, i) => (
            <g key={i}>
              <line
                x1={m.x}
                y1={MID - 4}
                x2={m.x}
                y2={MID + 4}
                stroke="#94a3b8"
                strokeWidth={m.isFirstOfYear ? 2 : 1}
              />
              <text
                x={m.x}
                y={MID + 22}
                fontSize="10"
                fill={m.isFirstOfYear ? "#0ea5e9" : "#64748b"}
                textAnchor="middle"
                fontWeight={m.isFirstOfYear ? 700 : 400}
              >
                {m.label}
              </text>
            </g>
          ))}

          {/* OGGI marker */}
          {(() => {
            const tx = ((today.getTime() - T_START.getTime()) / T_MS) * SVG_W;
            if (tx < 0 || tx > SVG_W) return null;
            return (
              <g>
                <line x1={tx} y1={MID - 280} x2={tx} y2={MID + 280} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" />
                <polygon
                  points={`${tx - 6},${MID - 6} ${tx + 6},${MID - 6} ${tx},${MID + 6}`}
                  fill="#ef4444"
                />
                <rect x={tx - 45} y={MID + 48} width={90} height={22} fill="#fff" stroke="#ef4444" strokeWidth={1.5} rx={4} />
                <text x={tx} y={MID + 63} fontSize="12" fontWeight={700} fill="#ef4444" textAnchor="middle">
                  {formatDateShort(today.toISOString())}
                </text>
              </g>
            );
          })()}

          {/* Milestone sopra (verdi) */}
          {above.map((m) => {
            if (!m.data_milestone || m.posizione == null) return null;
            const x = xFromDate(m.data_milestone) * SVG_W / 100;
            const yOffset = (m.posizione / maxAbove) * 240;
            const y = MID - yOffset;
            return (
              <g key={m.id}>
                <line x1={x} y1={MID} x2={x} y2={y} stroke="#94a3b8" strokeWidth={1} />
                <circle cx={x} cy={y} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                <text x={x + 12} y={y + 4} fontSize="11" fill="#0f172a" fontWeight={500}>
                  {m.etichetta ?? ""}
                </text>
              </g>
            );
          })}

          {/* Milestone sotto (blu) */}
          {below.map((m) => {
            if (!m.data_milestone || m.posizione == null) return null;
            const x = xFromDate(m.data_milestone) * SVG_W / 100;
            const yOffset = (Math.abs(m.posizione) / maxBelow) * 240;
            const y = MID + yOffset;
            return (
              <g key={m.id}>
                <line x1={x} y1={MID} x2={x} y2={y} stroke="#94a3b8" strokeWidth={1} />
                <rect x={x - 8} y={y - 8} width={16} height={16} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
                <text x={x + 12} y={y + 4} fontSize="11" fill="#0f172a" fontWeight={500}>
                  {m.etichetta ?? ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tabella dettaglio milestone */}
      <div className="adm-table-wrap">
        <table className="adm-table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <Th>Obiettivo Generale</Th>
              <Th>Obiettivi Specifici</Th>
              <Th>Azioni</Th>
              <Th>Superficie</Th>
              <Th>ID</Th>
              <Th>Min di Inizio</Th>
              <Th style={{ textAlign: "right" }}>Posizione</Th>
              <Th>Etichetta</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <Td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: (r.posizione ?? 0) > 0 ? "50%" : 0,
                      background: (r.posizione ?? 0) > 0 ? "#22c55e" : "#3b82f6",
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  {r.obiettivo_generale ?? "–"}
                </Td>
                <Td>{r.obiettivi_specifici ?? "–"}</Td>
                <Td>{r.azioni ?? "–"}</Td>
                <Td>{r.superficie ?? "–"}</Td>
                <Td style={{ fontFamily: "monospace" }}>{r.id_task ?? "–"}</Td>
                <Td>{formatDateShort(r.data_milestone)}</Td>
                <Td style={{ textAlign: "right", fontFamily: "monospace" }}>{r.posizione ?? "–"}</Td>
                <Td>{r.etichetta ?? "–"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSheetLayout>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={style}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={style}>{children}</td>;
}
