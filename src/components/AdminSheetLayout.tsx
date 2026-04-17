import Link from "next/link";

const NAV = [
  { slug: "cruscotto",         label: "Cruscotto" },
  { slug: "cronoprogramma",    label: "CronoProgramma" },
  { slug: "scadenze-go",       label: "Scadenze GO" },
  { slug: "scadenze-stop",     label: "Scadenze STOP" },
  { slug: "timeline-milestone", label: "Timeline - MILESTONE" },
  { slug: "gantt",             label: "Gantt" },
];

export function AdminSheetLayout({
  active,
  title,
  subtitle,
  children,
}: {
  active: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
              <h1>{title}</h1>
              <span>{subtitle}</span>
            </div>
          </div>
          <nav className="topnav">
            <Link href="/admin">← Indice sheet</Link>
          </nav>
        </div>
      </header>

      <div className="container" style={{ padding: "16px 24px 40px" }}>
        {/* Tab navigation: Excel-like sheet tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            overflowX: "auto",
            borderBottom: "2px solid #cbd5e1",
            marginBottom: 16,
            background: "#f1f5f9",
            padding: "4px 4px 0",
            borderRadius: "8px 8px 0 0",
          }}
        >
          {NAV.map((t) => {
            const isActive = t.slug === active;
            return (
              <Link
                key={t.slug}
                href={`/admin/sheet/${t.slug}`}
                style={{
                  padding: "10px 18px",
                  borderRadius: "8px 8px 0 0",
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  background: isActive ? "#fff" : "transparent",
                  color: isActive ? "#1e293b" : "#64748b",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  borderTop: isActive ? "3px solid #2563eb" : "3px solid transparent",
                  borderRight: isActive ? "1px solid #cbd5e1" : "none",
                  borderLeft: isActive ? "1px solid #cbd5e1" : "none",
                  marginBottom: -2,
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
