export default function Page() {
  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">CronoProgramma</h1>
      <p className="text-sm text-slate-500 mt-1">
        Tabella task pianificati per CUP (in arrivo — Sprint 1).
      </p>
      <div className="mt-4 text-sm text-slate-400">
        Da implementare: lettura da <code>bagnoli.task</code> JOIN <code>cup</code>,
        raggruppamento per macro-area, filtri per versione.
      </div>
    </div>
  );
}
