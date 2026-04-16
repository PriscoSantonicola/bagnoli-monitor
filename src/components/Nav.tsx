import Link from "next/link";

const links = [
  { href: "/", label: "Cruscotto" },
  { href: "/cronoprogramma", label: "CronoProgramma" },
  { href: "/scadenze", label: "Scadenze" },
  { href: "/milestone", label: "Milestone" },
  { href: "/gantt", label: "Gantt" },
  { href: "/mappa", label: "Mappa" },
];

export function Nav() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
        <Link href="/" className="font-semibold text-brand-600 text-lg">
          Bagnoli Monitor
        </Link>
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-slate-600 hover:text-brand-600 hover:underline underline-offset-4"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto text-xs text-slate-400">
          Programma Bagnoli-Coroglio · read-only
        </div>
      </div>
    </header>
  );
}
