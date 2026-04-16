import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SheetMeta = {
  id: number;
  sheet_name: string;
  ordine: number;
  nrows: number;
  ncols: number;
};
type RowData = {
  row_idx: number;
  cells: unknown[];
};
type AllSheet = {
  id: number;
  sheet_name: string;
  ordine: number;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/à/g, "a").replace(/è/g, "e").replace(/é/g, "e")
    .replace(/ì/g, "i").replace(/ò/g, "o").replace(/ù/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function colLetter(n: number): string {
  let s = "";
  n = n + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString("it-IT");
    return v.toLocaleString("it-IT", { maximumFractionDigits: 4 });
  }
  if (typeof v === "boolean") return v ? "VERO" : "FALSO";
  const s = String(v);
  // Datetime ISO ?
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const only = d.toISOString();
        // se ora = 00:00:00 mostra solo data
        if (only.includes("T00:00:00")) {
          return d.toISOString().slice(0, 10).split("-").reverse().join("/");
        }
        return d.toISOString().slice(0, 16).replace("T", " ");
      }
    } catch {}
  }
  return s;
}

async function loadSheet(slug: string) {
  const all = await q<AllSheet>(`
    SELECT id, sheet_name, ordine
    FROM bagnoli_cantieri.excel_sheet
    ORDER BY ordine;
  `);
  const target = all.find((s) => slugify(s.sheet_name) === slug);
  if (!target) return null;

  const [meta, rows] = await Promise.all([
    q<SheetMeta>(
      `SELECT id, sheet_name, ordine, nrows, ncols
       FROM bagnoli_cantieri.excel_sheet WHERE id = $1;`,
      [target.id]
    ),
    q<RowData>(
      `SELECT row_idx, cells
       FROM bagnoli_cantieri.excel_row
       WHERE sheet_id = $1
       ORDER BY row_idx;`,
      [target.id]
    ),
  ]);
  if (!meta[0]) return null;
  return { meta: meta[0], rows, all };
}

export default async function SheetDetail({ params }: { params: { slug: string } }) {
  const data = await loadSheet(params.slug);
  if (!data) notFound();
  const { meta, rows, all } = data;

  const maxCol = rows.reduce((m, r) => Math.max(m, (r.cells as unknown[]).length), meta.ncols);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="logo">
            <div
              className="logo-icon"
              style={{ background: "linear-gradient(135deg,#0f172a,#2563eb)" }}
            >
              <i className="fas fa-file-excel"></i>
            </div>
            <div className="logo-text">
              <h1>{meta.sheet_name}</h1>
              <span>
                Sheet {meta.ordine + 1} · {meta.nrows} righe × {maxCol} colonne · Confronto
                con Excel originale
              </span>
            </div>
          </div>
          <nav className="topnav">
            <Link href="/admin">← Indice sheet</Link>
          </nav>
        </div>
      </header>

      <div className="container" style={{ padding: "24px 24px 48px" }}>
        {/* Selettore rapido altri sheet */}
        <nav
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 20,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {all.map((s) => {
            const sl = slugify(s.sheet_name);
            const active = sl === params.slug;
            return (
              <Link
                key={s.id}
                href={`/admin/sheet/${sl}`}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  background: active ? "var(--blue)" : "#f1f5f9",
                  color: active ? "#fff" : "var(--text2)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {s.sheet_name}
              </Link>
            );
          })}
        </nav>

        {/* Tabella contenuto */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            overflow: "auto",
            maxWidth: "100%",
            maxHeight: "72vh",
            boxShadow: "var(--shadow)",
          }}
        >
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 12,
              fontFamily: "ui-sans-serif, system-ui, -apple-system",
              minWidth: "100%",
            }}
          >
            <thead>
              <tr>
                <th style={hdrCornerStyle}>#</th>
                {Array.from({ length: maxCol }).map((_, i) => (
                  <th key={i} style={hdrStyle}>
                    {colLetter(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cells = r.cells as unknown[];
                return (
                  <tr key={r.row_idx}>
                    <td style={rowHdrStyle}>{r.row_idx + 1}</td>
                    {Array.from({ length: maxCol }).map((_, i) => {
                      const v = cells[i];
                      const disp = fmtCell(v);
                      const isNum = typeof v === "number";
                      return (
                        <td
                          key={i}
                          style={{
                            ...cellStyle,
                            textAlign: isNum ? "right" : "left",
                            fontFamily: isNum
                              ? "ui-monospace, SFMono-Regular, monospace"
                              : undefined,
                            color:
                              v === null || v === undefined
                                ? "#cbd5e1"
                                : "var(--text)",
                          }}
                          title={disp}
                        >
                          {disp || (v === null || v === undefined ? "" : "")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--text3)",
            textAlign: "center",
          }}
        >
          Dati caricati verbatim dallo sheet Excel &quot;{meta.sheet_name}&quot;.
          Usa questa vista per confrontare 1:1 con il file sorgente.
        </p>
      </div>
    </div>
  );
}

const hdrCornerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  zIndex: 3,
  background: "#e2e8f0",
  padding: "6px 8px",
  fontWeight: 700,
  borderBottom: "2px solid #cbd5e1",
  borderRight: "2px solid #cbd5e1",
  fontSize: 10,
  minWidth: 42,
  textAlign: "center",
};

const hdrStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "#f1f5f9",
  padding: "6px 10px",
  fontWeight: 700,
  borderBottom: "2px solid #cbd5e1",
  borderRight: "1px solid #e2e8f0",
  fontSize: 10,
  color: "var(--text3)",
  textAlign: "center",
  minWidth: 90,
  whiteSpace: "nowrap",
};

const rowHdrStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  background: "#f8fafc",
  padding: "4px 8px",
  borderRight: "2px solid #cbd5e1",
  borderBottom: "1px solid #e2e8f0",
  fontSize: 10,
  color: "var(--text3)",
  textAlign: "center",
  fontWeight: 600,
  minWidth: 42,
};

const cellStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  borderRight: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 280,
};
