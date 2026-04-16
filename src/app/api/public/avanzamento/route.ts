import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/public/avanzamento
 *
 * Ritorna KPI globali + macro-aree (no elenchi puntuali, no tappe percorso).
 * Usato dal frontend pubblico /trasparenza.
 */
export async function GET() {
  try {
    // Conteggi globali per stato (basati su task importati dal Cruscotto)
    const kpiRows = await q<any>(`
      SELECT
        COUNT(*)::int                                              AS totale,
        COUNT(*) FILTER (WHERE stato ILIKE 'avviat%')::int         AS in_avanzamento,
        COUNT(*) FILTER (WHERE percentuale_avanzamento >= 100)::int AS completati,
        COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) = 0)::int AS non_iniziati
      FROM bagnoli_cantieri.task
      WHERE versione_id = 1;
    `);
    const kpi = kpiRows[0] ?? { totale: 0, in_avanzamento: 0, completati: 0, non_iniziati: 0 };

    // % globale: media aritmetica delle % task
    const globRows = await q<any>(`
      SELECT
        ROUND((AVG(COALESCE(percentuale_avanzamento,0))/100)::numeric, 4)::float AS pct_globale
      FROM bagnoli_cantieri.task
      WHERE versione_id = 1;
    `);
    const globale = globRows[0] ?? { pct_globale: 0 };

    // Per macro-area (aggregato), niente liste puntuali
    const aree = await q<any>(`
      SELECT
        w.nome                                                     AS macro_area,
        COUNT(t.id)::int                                           AS totale,
        COUNT(*) FILTER (WHERE t.percentuale_avanzamento >= 100)::int AS completati,
        COUNT(*) FILTER (WHERE COALESCE(t.percentuale_avanzamento,0) > 0
                          AND t.percentuale_avanzamento < 100)::int AS in_corso,
        COUNT(*) FILTER (WHERE COALESCE(t.percentuale_avanzamento,0) = 0)::int AS da_avviare,
        ROUND(AVG(COALESCE(t.percentuale_avanzamento,0))::numeric, 1)::float  AS pct_medio,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.cup c WHERE c.macro_area = w.nome) AS n_cup,
        (SELECT COALESCE(SUM(s.importo_intervento_eur),0)::numeric::float
           FROM bagnoli_cantieri.sintesi_intervento s
           JOIN bagnoli_cantieri.cup c ON c.id = s.cup_id
          WHERE c.macro_area = w.nome
            AND s.versione_id = 1) AS budget_eur
      FROM bagnoli_cantieri.wbs w
      LEFT JOIN bagnoli_cantieri.task t
        ON t.wbs_id = w.id AND t.versione_id = w.versione_id
      WHERE w.versione_id = 1 AND w.livello = 1
      GROUP BY w.nome, w.ordine
      ORDER BY w.nome;
    `);

    // Indicatori chiave (orizzonte temporale, budget totale)
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
