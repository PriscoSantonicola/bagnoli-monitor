import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [cupStats, taskStats, fonteStats, versioni] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS n_cup,
                COUNT(*) FILTER (WHERE attivo)::int AS n_cup_attivi,
                COUNT(DISTINCT macro_area)::int AS n_macro_aree
         FROM bagnoli.cup`
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS n_task,
                SUM(CASE WHEN fine_actual THEN 1 ELSE 0 END)::int AS n_completati,
                SUM(CASE WHEN inizio_actual AND NOT fine_actual THEN 1 ELSE 0 END)::int AS n_in_corso,
                SUM(CASE WHEN is_milestone THEN 1 ELSE 0 END)::int AS n_milestone
         FROM bagnoli.task`
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(importo_eur), 0)::numeric::float8 AS totale_eur,
                COUNT(*)::int AS n_fonti
         FROM bagnoli.fonte_finanziamento`
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT codice, fonte, data_riferimento, is_ufficiale
         FROM bagnoli.cronoprogramma_versione
         ORDER BY data_riferimento DESC`
      ),
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
