"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  pct: number;
  kpi: { totale: number; in_avanzamento: number; completati: number };
};

/**
 * Hero animato: gauge circolare + 3 KPI con counter animati.
 * Stroke color cambia in base a pct (verde >=60, blu >=30, arancio <30).
 */
export function HeroClient({ pct, kpi }: Props) {
  const [gaugePct, setGaugePct] = useState(0);
  const [tot, setTot] = useState(0);
  const [att, setAtt] = useState(0);
  const [comp, setComp] = useState(0);
  const arcRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    // Numero animato sul gauge
    const t0 = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (ts: number) => {
      const p = Math.min((ts - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setGaugePct(Math.round(ease * pct));
      setTot(Math.round(ease * kpi.totale));
      setAtt(Math.round(ease * kpi.in_avanzamento));
      setComp(Math.round(ease * kpi.completati));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pct, kpi.totale, kpi.in_avanzamento, kpi.completati]);

  const circ = 2 * Math.PI * 85;
  const offset = circ - (circ * Math.min(pct, 100)) / 100;
  const color = pct >= 60 ? "#22c55e" : pct >= 30 ? "#60a5fa" : "#f59e0b";

  useEffect(() => {
    if (!arcRef.current) return;
    arcRef.current.style.strokeDasharray = String(circ);
    arcRef.current.style.strokeDashoffset = String(circ);
    const id = setTimeout(() => {
      if (arcRef.current) arcRef.current.style.strokeDashoffset = String(offset);
    }, 120);
    return () => clearTimeout(id);
  }, [offset, circ]);

  return (
    <div className="hero-gauge">
      <div className="gauge">
        <svg viewBox="0 0 200 200">
          <circle className="gauge-bg" cx="100" cy="100" r="85" />
          <circle
            ref={arcRef}
            className="gauge-fill"
            cx="100"
            cy="100"
            r="85"
            stroke={color}
          />
        </svg>
        <div className="gauge-center">
          <span className="gauge-val">{gaugePct}%</span>
          <span className="gauge-lbl">Completamento</span>
        </div>
      </div>
      <div className="hero-kpis">
        <div className="hero-kpi">
          <span className="hkv">{tot}</span>
          <span className="hkl">Attività totali</span>
        </div>
        <div className="hero-kpi">
          <span className="hkv" style={{ color: "#22c55e" }}>
            {att}
          </span>
          <span className="hkl">In corso</span>
        </div>
        <div className="hero-kpi">
          <span className="hkv" style={{ color: "#60a5fa" }}>
            {comp}
          </span>
          <span className="hkl">Completate</span>
        </div>
      </div>
    </div>
  );
}
