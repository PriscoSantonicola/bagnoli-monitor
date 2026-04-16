import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [cupStats, taskStats, fonteStats, versioni] = await Promise.all([
      q<any>(`
        SELECT COUNT(*)::int AS n_cup,
               COUNT(*) FILTER (WHERE attivo)::int AS n_cup_attivi,
               COUNT(DISTINCT macro_area)::int AS n_macro_aree
        FROM bagnoli_cantieri.cup
      `),
      q<any>(`
        SELECT COUNT(*)::int AS n_task,
               COUNT(*) FILTER (WHERE percentuale_avanzamento >= 100)::int AS n_completati,
               COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) > 0
                                 AND percentuale_avanzamento < 100)::int AS n_in_corso,
               COUNT(*) FILTER (WHERE is_milestone)::int AS n_milestone
        FROM bagnoli_cantieri.task
      `),
      q<any>(`
        SELECT COALESCE(SUM(importo_eur), 0)::numeric::float8 AS totale_eur,
               COUNT(*)::int AS n_fonti
        FROM bagnoli_cantieri.fonte_finanziamento
      `),
      q<any>(`
        SELECT codice, fonte, data_riferimento, is_ufficiale
        FROM bagnoli_cantieri.cronoprogramma_versione
        ORDER BY data_riferimento DESC
      `),
    ]);

    return NextResponse.json({
      cup: cupStats[0] ?? { n_cup: 0, n_cup_attivi: 0, n_macro_aree: 0 },
      task: taskStats[0] ?? { n_task: 0, n_completati: 0, n_in_corso: 0, n_milestone: 0 },
      fonti: fonteStats[0] ?? { totale_eur: 0, n_fonti: 0 },
      versioni,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "db_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
