import { q } from "@/lib/db";
import { AdminSheetLayout } from "@/components/AdminSheetLayout";
import { formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CronoRow = {
  id: number;
  id_path: string;
  livello: number;
  star_marker: string | null;
  obiettivo_generale: string | null;
  obiettivi_specifici: string | null;
  azioni: string | null;
  sub_ambito: string | null;
  superficie: string | null;
  area_tematica: string | null;
  unita_intervento: string | null;
  cup: string | null;
  processo: string | null;
  fase_label: string | null;
  descrizione: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  durata_giorni: number | null;
  pct_avanzamento: number | null;
  row_idx: number;
};

async function loadData() {
  return q<CronoRow>(`
    SELECT id, id_path, livello, star_marker, obiettivo_generale, obiettivi_specifici,
           azioni, sub_ambito, superficie, area_tematica, unita_intervento,
           cup, processo, fase_label, descrizione,
           data_inizio::text AS data_inizio, data_fine::text AS data_fine,
           durata_giorni, pct_avanzamento::float AS pct_avanzamento, row_idx
      FROM bagnoli_cantieri.crono_task ORDER BY row_idx;
  `);
}

export default async function CronoPage() {
  const rows = await loadData();

  // Statistiche per header
  const nLiv1 = rows.filter((r) => r.livello === 1).length;
  const nLiv2 = rows.filter((r) => r.livello === 2).length;
  const nStar = rows.filter((r) => r.star_marker).length;

  return (
    <AdminSheetLayout
      active="cronoprogramma"
      title="CronoProgramma"
      subtitle="Albero gerarchico delle attività — replica sheet Excel «CronoProgramma»"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Stat label="Righe totali" value={rows.length} color="#2563eb" />
        <Stat label="Nodi livello 1" value={nLiv1} color="#16a34a" />
        <Stat label="Nodi livello 2" value={nLiv2} color="#f59e0b" />
        <Stat label="Attività marker (*)" value={nStar} color="#ef4444" />
      </div>

      {/* Legenda colori */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          marginBottom: 14,
          fontSize: 12,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <strong>Colore per Obiettivo:</strong>
        <span>
          <Dot c="#16a34a" /> Risanamento ambientale
        </span>
        <span>
          <Dot c="#2563eb" /> Rigenerazione urbana
        </span>
        <span>
          <Dot c="#f59e0b" /> Infrastrutture
        </span>
        <span>
          <Dot c="#7c3aed" /> Altro/Trasversali
        </span>
      </div>

      {/* Tabella gerarchica */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "auto",
          maxHeight: "75vh",
          boxShadow: "var(--shadow)",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1100,
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#f1f5f9" }}>
            <tr>
              <Th>ID</Th>
              <Th>*</Th>
              <Th>Obiettivo Generale</Th>
              <Th>Obiettivi Specifici</Th>
              <Th>Azioni</Th>
              <Th>Superficie</Th>
              <Th>Area Tem.</Th>
              <Th>Fase</Th>
              <Th>Descrizione</Th>
              <Th>Inizio</Th>
              <Th>Fine</Th>
              <Th style={{ textAlign: "right" }}>Durata</Th>
              <Th style={{ textAlign: "right" }}>% Av.</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const color = colorForMacro(r.obiettivo_generale);
              const pct = (r.pct_avanzamento ?? 0) * 100;
              const pad = (r.livello - 1) * 16;
              return (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: r.livello === 1 ? "#fafbff" : "#fff",
                    fontWeight: r.livello === 1 ? 600 : 400,
                  }}
                >
                  <Td style={{ fontFamily: "ui-monospace,monospace", fontWeight: 700, paddingLeft: 10 + pad }}>
                    {r.id_path}
                  </Td>
                  <Td style={{ color: "#ef4444", fontWeight: 800, textAlign: "center" }}>
                    {r.star_marker ?? ""}
                  </Td>
                  <Td>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: color,
                        marginRight: 6,
                        verticalAlign: "middle",
                      }}
                    />
                    {short(r.obiettivo_generale)}
                  </Td>
                  <Td>{short(r.obiettivi_specifici)}</Td>
                  <Td>{short(r.azioni)}</Td>
                  <Td>{short(r.superficie)}</Td>
                  <Td>{short(r.area_tematica)}</Td>
                  <Td style={{ fontSize: 11 }}>{short(r.fase_label)}</Td>
                  <Td style={{ color: "#334155", maxWidth: 360 }}>
                    {short(r.descrizione)}
                  </Td>
                  <Td style={{ whiteSpace: "nowrap" }}>{formatDateShort(r.data_inizio)}</Td>
                  <Td style={{ whiteSpace: "nowrap" }}>{formatDateShort(r.data_fine)}</Td>
                  <Td style={{ textAlign: "right", fontFamily: "ui-monospace,monospace" }}>
                    {r.durata_giorni ?? "–"}
                  </Td>
                  <Td
                    style={{
                      textAlign: "right",
                      fontFamily: "ui-monospace,monospace",
                      fontWeight: 700,
                      color: pct >= 100 ? "#16a34a" : pct > 0 ? "#2563eb" : "#94a3b8",
                    }}
                  >
                    {pct ? `${pct.toFixed(2).replace(".", ",")}%` : "–"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminSheetLayout>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 14,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          color: "var(--text3)",
          letterSpacing: ".5px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 2,
        background: c,
        marginRight: 4,
        verticalAlign: "middle",
      }}
    />
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 10px",
        borderBottom: "2px solid #cbd5e1",
        borderRight: "1px solid #e2e8f0",
        fontSize: 10,
        textTransform: "uppercase",
        color: "#64748b",
        fontWeight: 700,
        letterSpacing: ".4px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderRight: "1px solid #f1f5f9",
        verticalAlign: "top",
        ...style,
      }}
    >
      {children}
    </td>
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
