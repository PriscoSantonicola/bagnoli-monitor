export default function Page() {
  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Milestone</h1>
      <p className="text-sm text-slate-500 mt-1">Milestone principali del programma (Sprint 2).</p>
      <div className="mt-4 text-sm text-slate-400">
        Da implementare: SELECT da <code>bagnoli.task WHERE is_milestone=TRUE</code>.
      </div>
    </div>
  );
}
