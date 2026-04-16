import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/public/finanze
 *
 * KPI finanziari aggregati per macro-area (no elenchi puntuali).
 */
export async function GET() {
  try {
    const totali = await q<any>(`
      SELECT
        COALESCE(SUM(f.importo_eur), 0)::numeric::float AS tot_generale,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%FSC%'), 0)::numeric::float       AS tot_fsc,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%Comune%'), 0)::numeric::float   AS tot_comune,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%DL 148%'), 0)::numeric::float   AS tot_dl148,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%Amianto%'), 0)::numeric::float  AS tot_amianto,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%DL 185%'
                                              OR f.denominazione ILIKE '%Adp%'), 0)::numeric::float      AS tot_altre
      FROM bagnoli_cantieri.fonte_finanziamento f
      WHERE f.versione_id = 1;
    `);

    const gare = await q<any>(`
      SELECT
        COUNT(*)::int                                                                         AS totale,
        COUNT(*) FILTER (WHERE stato ILIKE '%aggiudic%' OR data_aggiudicazione IS NOT NULL)::int  AS aggiudicate,
        COUNT(*) FILTER (WHERE stato ILIKE '%pubblic%' OR stato ILIKE '%corso%')::int         AS in_corso,
        COALESCE(SUM(importo_base_eur), 0)::numeric::float                                    AS importo_totale
      FROM bagnoli_cantieri.attivita_gara
      WHERE versione_id = 1;
    `);

    const per_macro = await q<any>(`
      SELECT
        c.macro_area,
        COUNT(DISTINCT c.id)::int                                            AS n_cup,
        COALESCE(SUM(s.importo_intervento_eur), 0)::numeric::float            AS importo_intervento,
        COALESCE(SUM(s.importo_somme_disp_eur), 0)::numeric::float            AS consuntivo
      FROM bagnoli_cantieri.cup c
      LEFT JOIN bagnoli_cantieri.sintesi_intervento s
        ON s.cup_id = c.id AND s.versione_id = 1
      GROUP BY c.macro_area
      ORDER BY c.macro_area;
    `);

    return NextResponse.json({
      totali: totali[0] ?? {},
      gare: gare[0] ?? {},
      per_macro,
      aggiornato_al: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "db_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
