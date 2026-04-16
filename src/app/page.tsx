import { formatEuro, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

async function getData() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/cruscotto`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function Page() {
  const data = await getData();

  if (!data || data.error) {
    return (
      <div className="card">
        <h1 className="text-2xl font-semibold mb-2">Cruscotto</h1>
        <p className="text-amber-700">
          Nessun dato disponibile. Verifica connessione DB e seed iniziale.
        </p>
        {data?.message && (
          <pre className="mt-3 text-xs bg-slate-50 p-2 rounded overflow-auto">{data.message}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cruscotto</h1>
        <p className="text-sm text-slate-500">
          Panoramica Programma Bagnoli-Coroglio · aggiornato{" "}
          <span className="font-medium">
            {formatDate(data.versioni[0]?.data_riferimento)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card kpi">
          <span className="kpi-label">CUP attivi</span>
          <span className="kpi-value">{data.cup.n_cup_attivi}</span>
          <span className="kpi-sub">su {data.cup.n_cup} totali</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Macro aree</span>
          <span className="kpi-value">{data.cup.n_macro_aree}</span>
          <span className="kpi-sub">tematiche distinte</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Task totali</span>
          <span className="kpi-value">{data.task.n_task}</span>
          <span className="kpi-sub">
            {data.task.n_completati} completati · {data.task.n_in_corso} in corso
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Finanziamenti</span>
          <span className="kpi-value">{formatEuro(data.fonti.totale_eur)}</span>
          <span className="kpi-sub">{data.fonti.n_fonti} fonti</span>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Snapshot cronoprogramma</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Codice</th>
              <th className="py-2">Fonte</th>
              <th className="py-2">Data riferimento</th>
              <th className="py-2">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data.versioni.map((v: any) => (
              <tr key={v.codice} className="border-b last:border-b-0">
                <td className="py-2 font-mono text-xs">{v.codice}</td>
                <td className="py-2">{v.fonte}</td>
                <td className="py-2">{formatDate(v.data_riferimento)}</td>
                <td className="py-2">
                  {v.is_ufficiale ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs">
                      ufficiale
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                      operativo
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
