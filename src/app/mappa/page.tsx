export default function Page() {
  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Mappa</h1>
      <p className="text-sm text-slate-500 mt-1">Unità di intervento geolocalizzate (Sprint 4).</p>
      <div className="mt-4 text-sm text-slate-400">
        Rendering Leaflet da <code>bagnoli.unita_intervento(lat, lon)</code>,
        popup con task collegati.
      </div>
    </div>
  );
}
