import Link from "next/link";

const NAV = [
  { slug: "cruscotto",          label: "Cruscotto" },
  { slug: "cronoprogramma",     label: "CronoProgramma" },
  { slug: "scadenze-go",        label: "Scadenze GO" },
  { slug: "scadenze-stop",      label: "Scadenze STOP" },
  { slug: "timeline-milestone", label: "MILESTONE" },
  { slug: "gantt",              label: "Gantt" },
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
            <Link href="/admin">← Indice</Link>
          </nav>
        </div>
      </header>

      <div className="container adm-container">
        <div className="adm-tabs">
          {NAV.map((t) => (
            <Link
              key={t.slug}
              href={`/admin/sheet/${t.slug}`}
              className={"adm-tab" + (t.slug === active ? " active" : "")}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
