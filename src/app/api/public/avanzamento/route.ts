import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/public/avanzamento
 *
 * Ritorna KPI globali + macro-aree aggregate secondo la classificazione del foglio
 * CUP dell'Excel (3 macro-aree: Rigenerazione urbana, Risanamento ambientale,
 * Attivita Trasversali). I task del WBS "Infrastrutture" sono figli concettuali di
 * "Rigenerazione urbana" (come nell'Excel fonte CUP), quindi li riaggreghiamo li'.
 */
export async function GET() {
  try {
    // Conteggi globali per stato
    const kpiRows = await q<any>(`
      SELECT
        COUNT(*)::int                                                       AS totale,
        COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) > 0
                         AND percentuale_avanzamento < 100)::int            AS in_avanzamento,
        COUNT(*) FILTER (WHERE percentuale_avanzamento >= 100)::int         AS completati,
        COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) = 0)::int AS non_iniziati
      FROM bagnoli_cantieri.task
      WHERE versione_id = 1;
    `);
    const kpi = kpiRows[0] ?? { totale: 0, in_avanzamento: 0, completati: 0, non_iniziati: 0 };

    // % globale (media aritmetica)
    const globRows = await q<any>(`
      SELECT
        ROUND((AVG(COALESCE(percentuale_avanzamento,0))/100)::numeric, 4)::float AS pct_globale
      FROM bagnoli_cantieri.task
      WHERE versione_id = 1;
    `);
    const globale = globRows[0] ?? { pct_globale: 0 };

    // Aggregazione per macro-area SECONDO CUP (3 macro-aree come nell'Excel CUP sheet).
    // I task del WBS 'Infrastrutture' sono mappati su 'Rigenerazione urbana'
    // perche' nel foglio CUP (R17-19) esistono solo 3 macro-aree finanziarie.
    const aree = await q<any>(`
      WITH task_mapped AS (
        SELECT
          t.id,
          t.percentuale_avanzamento,
          CASE
            WHEN w.nome = 'Infrastrutture' THEN 'Rigenerazione urbana'
            ELSE w.nome
          END AS macro_area
        FROM bagnoli_cantieri.task t
        LEFT JOIN bagnoli_cantieri.wbs w ON w.id = t.wbs_id
        WHERE t.versione_id = 1
      ),
      cup_agg AS (
        SELECT
          c.macro_area,
          COUNT(*)::int AS n_cup,
          COALESCE(SUM(s.importo_intervento_eur),0)::numeric::float AS budget_eur
        FROM bagnoli_cantieri.cup c
        LEFT JOIN bagnoli_cantieri.sintesi_intervento s
          ON s.cup_id = c.id AND s.versione_id = 1
        GROUP BY c.macro_area
      )
      SELECT
        tm.macro_area,
        COUNT(tm.id)::int                                               AS totale,
        COUNT(*) FILTER (WHERE tm.percentuale_avanzamento >= 100)::int  AS completati,
        COUNT(*) FILTER (WHERE COALESCE(tm.percentuale_avanzamento,0) > 0
                          AND tm.percentuale_avanzamento < 100)::int    AS in_corso,
        COUNT(*) FILTER (WHERE COALESCE(tm.percentuale_avanzamento,0) = 0)::int AS da_avviare,
        ROUND(AVG(COALESCE(tm.percentuale_avanzamento,0))::numeric, 1)::float   AS pct_medio,
        COALESCE(ca.n_cup, 0)      AS n_cup,
        COALESCE(ca.budget_eur, 0) AS budget_eur
      FROM task_mapped tm
      LEFT JOIN cup_agg ca ON ca.macro_area = tm.macro_area
      GROUP BY tm.macro_area, ca.n_cup, ca.budget_eur
      ORDER BY tm.macro_area;
    `);

    // Orizzonte temporale globale
    const orizzonte = await q<any>(`
      SELECT
        MIN(data_inizio) AS data_inizio_min,
        MAX(data_fine)   AS data_fine_max
      FROM bagnoli_cantieri.task
      WHERE versione_id = 1;
    `);

    return NextResponse.json({
      kpi,
      globale,
      aree,
      orizzonte: orizzonte[0] ?? null,
      aggiornato_al: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "db_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
