import { q } from "@/lib/db";
import { AdminSheetLayout } from "./AdminSheetLayout";
import { formatDateShort } from "@/lib/format";

type ScadenzaRow = {
  id: number;
  data_evento: string | null;
  a_procedimento: string | null;
  b_sub_procedimento: string | null;
  c_fase: string | null;
  d_sub_fase: string | null;
  e_step: string | null;
  f_step_1: string | null;
};

export async function ScadenzeView({ tipo }: { tipo: "GO" | "STOP" }) {
  const rows = await q<ScadenzaRow>(
    `SELECT id, data_evento::text AS data_evento,
            a_procedimento, b_sub_procedimento, c_fase, d_sub_fase, e_step, f_step_1
       FROM bagnoli_cantieri.scadenza
      WHERE tipo = $1
      ORDER BY data_evento, id;`,
    [tipo]
  );
  const isGo = tipo === "GO";
  const dateCol = isGo ? "Inizio" : "Fine";
  const bannerBg = isGo ? "#d7f5d0" : "#ffd7d7";
  const bannerText = isGo ? "Attività in avvio" : "Attività in conclusione";
  const active = isGo ? "scadenze-go" : "scadenze-stop";
  const icon = isGo ? "fa-play-circle" : "fa-flag-checkered";
  const title = `Scadenze ${tipo}`;

  return (
    <AdminSheetLayout
      active={active}
      title={title}
      subtitle={`Replica sheet Excel «${title}» — ${rows.length} scadenze cronologiche`}
    >
      <div
        style={{
          background: bannerBg,
          border: "1px solid rgba(0,0,0,.08)",
          padding: "12px 18px",
          borderRadius: 8,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        <i className={`fas ${icon}`}></i>
        {bannerText}
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 500 }}>
          {rows.length} righe
        </span>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "auto",
          boxShadow: "var(--shadow)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ background: "#f1f5f9" }}>
            <tr>
              <Th style={{ minWidth: 110 }}>{dateCol}</Th>
              <Th>A - Procedimento</Th>
              <Th>B - Sub Procedimento</Th>
              <Th>C - Fase</Th>
              <Th>D - Sub Fase</Th>
              <Th>E - Step</Th>
              <Th>F - Step 1</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <Td
                  style={{
                    fontFamily: "ui-monospace,monospace",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    background: isGo ? "#f0fdf4" : "#fef2f2",
                  }}
                >
                  {formatDateShort(r.data_evento)}
                </Td>
                <Td>{short(r.a_procedimento)}</Td>
                <Td>{short(r.b_sub_procedimento)}</Td>
                <Td>{short(r.c_fase)}</Td>
                <Td>{short(r.d_sub_fase)}</Td>
                <Td>{short(r.e_step)}</Td>
                <Td>{short(r.f_step_1)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSheetLayout>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderBottom: "2px solid #cbd5e1",
        borderRight: "1px solid #e2e8f0",
        fontSize: 10,
        textTransform: "uppercase",
        color: "#64748b",
        fontWeight: 700,
        letterSpacing: ".4px",
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
        padding: "8px 12px",
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
