"use client";
import { useEffect, useState } from "react";

export function ProgressClient({ pct }: { pct: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setW(Math.min(pct, 100)), 200);
    return () => clearTimeout(id);
  }, [pct]);
  return (
    <div className="bp-track">
      <div className="bp-fill" data-pct={`${pct}%`} style={{ width: `${w}%` }}></div>
    </div>
  );
}
