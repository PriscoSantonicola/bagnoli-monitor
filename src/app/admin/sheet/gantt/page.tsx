import { q } from "@/lib/db";
import { AdminSheetLayout } from "@/components/AdminSheetLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GanttRow = {
  id: number;
  row_idx: number;
  obiettivo_generale: string | null;
  obiettivi_specifici: string | null;
  azioni: string | null;
  sub_ambito: string | null;
  fase: string | null;
  ranges: { start: string; end: string }[];
};

async function loadData() {
  const rows = await q<GanttRow>(`
    SELECT id, row_idx, obiettivo_generale, obiettivi_specifici, azioni,
           sub_ambito, fase, ranges
      FROM bagnoli_cantieri.gantt_row
      ORDER BY row_idx;
  `);
  const [minmax] = await q<{ dmin: string; dmax: string }>(`
    SELECT MIN(data_giorno)::text AS dmin, MAX(data_giorno)::text AS dmax
      FROM bagnoli_cantieri.gantt_date;
  `);
  return { rows, minmax };
}

const MESI_ABBR = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default async function Page() {
  const { rows, minmax } = await loadData();
  const T_START = new Date(minmax.dmin ?? "2021-10-07");
  const T_END = new Date(minmax.dmax ?? "2030-06-30");
  const T_DAYS = (T_END.getTime() - T_START.getTime()) / (1000 * 60 * 60 * 24);

  // Genera header anni + mesi
  const years: { year: number; left: number; width: number }[] = [];
  const months: { month: string; left: number; width: number; isOdd: boolean }[] = [];
  {
    let curYear = T_START.getFullYear();
    let yearStart = 0;
    const cur = new Date(T_START);
    while (cur <= T_END) {
      const monthStart = ((cur.getTime() - T_START.getTime()) / (1000 * 60 * 60 * 24)) / T_DAYS * 100;
      // fine mese
      const nextMonth = new Date(cur);
      nextMonth.setMonth(cur.getMonth() + 1);
      const monthEnd = Math.min(T_END.getTime(), nextMonth.getTime());
      const monthEndPct = ((monthEnd - T_START.getTime()) / (1000 * 60 * 60 * 24)) / T_DAYS * 100;
      months.push({
        month: MESI_ABBR[cur.getMonth()],
        left: monthStart,
        width: monthEndPct - monthStart,
        isOdd: cur.getMonth() % 2 === 1,
      });
      // cambio anno
      if (nextMonth.getFullYear() !== curYear || nextMonth >= T_END) {
        years.push({
          year: curYear,
          left: yearStart,
          width: monthEndPct - yearStart,
        });
        yearStart = monthEndPct;
        curYear = nextMonth.getFullYear();
      }
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // Raggruppa per (obiettivo_generale, obiettivi_specifici, azioni, sub_ambito)
  type Group = {
    obiettivo_generale: string;
    obiettivi_specifici: string;
    azioni: string;
    sub_ambito: string;
    rows: GanttRow[];
  };
  const groups: Record<string, Group> = {};
  rows.forEach((r) => {
    const og = r.obiettivo_generale ?? "–";
    const os = r.obiettivi_specifici ?? "–";
    const az = r.azioni ?? "–";
    const sa = r.sub_ambito ?? "–";
    const k = `${og}|${os}|${az}|${sa}`;
    if (!groups[k]) groups[k] = { obiettivo_generale: og, obiettivi_specifici: os, azioni: az, sub_ambito: sa, rows: [] };
    groups[k].rows.push(r);
  });
  const groupList = Object.values(groups);

  const today = new Date();
  const todayPct = ((today.getTime() - T_START.getTime()) / (1000 * 60 * 60 * 24)) / T_DAYS * 100;

  return (
    <AdminSheetLayout
      active="gantt"
      title="Gantt"
      subtitle={`Replica sheet Excel «Gantt» — ${rows.length} attività su orizzonte ${T_START.toLocaleDateString("it-IT")} → ${T_END.toLocaleDateString("it-IT")}`}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          marginBottom: 14,
          fontSize: 12,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <strong>Legenda:</strong>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 20,
              height: 12,
              background: "#3b82f6",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          Attività attiva (range X contigui in Excel)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 1,
              height: 16,
              borderLeft: "2px dashed #ef4444",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          OGGI {today.toLocaleDateString("it-IT")}
        </span>
        <span style={{ marginLeft: "auto" }}>
          Gruppi: <strong>{groupList.length}</strong> · Task rows:{" "}
          <strong>{rows.length}</strong>
        </span>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "auto",
          boxShadow: "var(--shadow)",
          maxHeight: "80vh",
        }}
      >
        <div style={{ minWidth: 1800, position: "relative" }}>
          {/* Header anni */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "360px 1fr",
              background: "#f1f5f9",
              borderBottom: "1px solid #cbd5e1",
              position: "sticky",
              top: 0,
              zIndex: 3,
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                fontWeight: 700,
                fontSize: 11,
                color: "#64748b",
                borderRight: "1px solid #cbd5e1",
              }}
            >
              Categorizzazione
            </div>
            <div style={{ position: "relative", height: 22 }}>
              {years.map((y) => (
                <div
                  key={y.year}
                  style={{
                    position: "absolute",
                    left: `${y.left}%`,
                    width: `${y.width}%`,
                    top: 0,
                    bottom: 0,
                    borderRight: "1px solid #cbd5e1",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#0ea5e9",
                    paddingTop: 3,
                  }}
                >
                  {y.year}
                </div>
              ))}
            </div>
          </div>

          {/* Header mesi */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "360px 1fr",
              background: "#f8fafc",
              borderBottom: "2px solid #cbd5e1",
              position: "sticky",
              top: 22,
              zIndex: 3,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                borderRight: "1px solid #cbd5e1",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              <div style={{ padding: "6px 4px", borderRight: "1px solid #e2e8f0", textAlign: "center" }}>
                Obiettivo
              </div>
              <div style={{ padding: "6px 4px", borderRight: "1px solid #e2e8f0", textAlign: "center" }}>
                Specifici
              </div>
              <div style={{ padding: "6px 4px", borderRight: "1px solid #e2e8f0", textAlign: "center" }}>
                Azioni
              </div>
              <div style={{ padding: "6px 4px", textAlign: "center" }}>Sub Amb.</div>
            </div>
            <div style={{ position: "relative", height: 22 }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${m.left}%`,
                    width: `${m.width}%`,
                    top: 0,
                    bottom: 0,
                    borderRight: "1px solid #e2e8f0",
                    textAlign: "center",
                    fontSize: 8,
                    color: "#64748b",
                    paddingTop: 5,
                    background: m.isOdd ? "rgba(148,163,184,.08)" : "transparent",
                  }}
                >
                  {m.month}
                </div>
              ))}
            </div>
          </div>

          {/* Rows Gantt */}
          {groupList.map((g, gi) => (
            <div key={gi}>
              {g.rows.map((r, ri) => {
                const color = colorForMacro(r.obiettivo_generale);
                const isFirst = ri === 0;
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "360px 1fr",
                      borderBottom: "1px solid #f1f5f9",
                      fontSize: 10,
                      minHeight: 22,
                      alignItems: "center",
                    }}
                  >
                    {/* Categorie 4 col */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr",
                        borderRight: "1px solid #cbd5e1",
                        minHeight: 22,
                      }}
                    >
                      <div
                        style={{
                          padding: "3px 6px",
                          borderRight: "1px solid #f1f5f9",
                          background: isFirst ? "#dcfce7" : "#fff",
                          color: isFirst ? color : "#94a3b8",
                          fontWeight: isFirst ? 700 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.obiettivo_generale ?? ""}
                      >
                        {isFirst ? short(r.obiettivo_generale) : ""}
                      </div>
                      <div
                        style={{
                          padding: "3px 6px",
                          borderRight: "1px solid #f1f5f9",
                          background: isFirst ? "#dbeafe" : "#fff",
                          fontWeight: isFirst ? 600 : 400,
                          color: isFirst ? "#1e40af" : "#94a3b8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.obiettivi_specifici ?? ""}
                      >
                        {isFirst ? short(r.obiettivi_specifici) : ""}
                      </div>
                      <div
                        style={{
                          padding: "3px 6px",
                          borderRight: "1px solid #f1f5f9",
                          background: isFirst ? "#fce7f3" : "#fff",
                          color: isFirst ? "#be185d" : "#94a3b8",
                          fontWeight: isFirst ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.azioni ?? ""}
                      >
                        {isFirst ? short(r.azioni) : ""}
                      </div>
                      <div
                        style={{
                          padding: "3px 6px",
                          background: isFirst ? "#ffe4e6" : "#fff",
                          color: isFirst ? "#b91c1c" : "#94a3b8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.sub_ambito ?? ""}
                      >
                        {isFirst ? short(r.sub_ambito) : ""}
                      </div>
                    </div>

                    {/* Gantt bars */}
                    <div style={{ position: "relative", height: 22, background: "#fafbff" }}>
                      {/* OGGI line */}
                      {todayPct > 0 && todayPct < 100 && (
                        <div
                          style={{
                            position: "absolute",
                            left: `${todayPct}%`,
                            top: 0,
                            bottom: 0,
                            width: 0,
                            borderLeft: "2px dashed #ef4444",
                            zIndex: 2,
                          }}
                        />
                      )}
                      {/* Range bars */}
                      {r.ranges.map((rg, i) => {
                        const d0 = new Date(rg.start).getTime();
                        const d1 = new Date(rg.end).getTime();
                        const left = ((d0 - T_START.getTime()) / (1000 * 60 * 60 * 24)) / T_DAYS * 100;
                        const width = ((d1 - d0) / (1000 * 60 * 60 * 24) + 1) / T_DAYS * 100;
                        return (
                          <div
                            key={i}
                            title={`${rg.start} → ${rg.end}`}
                            style={{
                              position: "absolute",
                              left: `${left}%`,
                              width: `${Math.max(0.1, width)}%`,
                              top: 4,
                              bottom: 4,
                              background: color,
                              borderRadius: 2,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </AdminSheetLayout>
  );
}

function short(s: string | null): string {
  if (!s) return "–";
  return s.replace("(vuoto)", "–");
}

function colorForMacro(m: string | null): string {
  if (!m) return "#94a3b8";
  if (m.includes("Risanamento")) return "#22c55e";
  if (m.includes("Rigenerazione")) return "#3b82f6";
  if (m.includes("Infrastru")) return "#f59e0b";
  if (m.toLowerCase().includes("trasv") || m.includes("Altro")) return "#7c3aed";
  return "#64748b";
}
