import { q } from "@/lib/db";
import { formatInt, formatMeur, formatPct, formatDate } from "@/lib/format";
import { HeroClient } from "@/components/HeroClient";
import { ProgressClient } from "@/components/ProgressClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Kpi = {
  totale: number;
  in_avanzamento: number;
  completati: number;
  non_iniziati: number;
};
type AreaRow = {
  macro_area: string;
  totale: number;
  completati: number;
  in_corso: number;
  da_avviare: number;
  pct_medio: number;
  n_cup: number;
  budget_eur: number;
};
type Finanze = {
  tot_generale: number;
  tot_fsc: number;
  tot_comune: number;
  tot_dl148: number;
  tot_amianto: number;
  tot_altre: number;
};
type Gare = {
  totale: number;
  aggiudicate: number;
  in_corso: number;
  importo_totale: number;
};
type VersioneRow = {
  codice: string;
  fonte: string;
  versione_label: string | null;
  data_riferimento: string;
  is_ufficiale: boolean;
};

async function loadData() {
  const [kpiR, globR, aree, finR, gareR, verR] = await Promise.all([
    q<Kpi>(`
      SELECT
        COUNT(*)::int AS totale,
        COUNT(*) FILTER (WHERE stato ILIKE 'avviat%')::int AS in_avanzamento,
        COUNT(*) FILTER (WHERE percentuale_avanzamento >= 100)::int AS completati,
        COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) = 0)::int AS non_iniziati
      FROM bagnoli_cantieri.task WHERE versione_id = 1;
    `),
    q<{ pct_globale: number }>(`
      SELECT
        ROUND(AVG(COALESCE(percentuale_avanzamento,0))::numeric, 1)::float AS pct_globale
      FROM bagnoli_cantieri.task WHERE versione_id = 1;
    `),
    q<AreaRow>(`
      SELECT
        w.nome AS macro_area,
        COUNT(t.id)::int AS totale,
        COUNT(*) FILTER (WHERE t.percentuale_avanzamento >= 100)::int AS completati,
        COUNT(*) FILTER (WHERE COALESCE(t.percentuale_avanzamento,0) > 0
                          AND t.percentuale_avanzamento < 100)::int AS in_corso,
        COUNT(*) FILTER (WHERE COALESCE(t.percentuale_avanzamento,0) = 0)::int AS da_avviare,
        ROUND(AVG(COALESCE(t.percentuale_avanzamento,0))::numeric, 1)::float AS pct_medio,
        (SELECT COUNT(*)::int FROM bagnoli_cantieri.cup c WHERE c.macro_area = w.nome) AS n_cup,
        (SELECT COALESCE(SUM(s.importo_intervento_eur),0)::numeric::float
           FROM bagnoli_cantieri.sintesi_intervento s
           JOIN bagnoli_cantieri.cup c ON c.id = s.cup_id
          WHERE c.macro_area = w.nome AND s.versione_id = 1) AS budget_eur
      FROM bagnoli_cantieri.wbs w
      LEFT JOIN bagnoli_cantieri.task t ON t.wbs_id = w.id AND t.versione_id = w.versione_id
      WHERE w.versione_id = 1 AND w.livello = 1
      GROUP BY w.nome, w.codice
      ORDER BY
        CASE w.codice WHEN 'RAM' THEN 1 WHEN 'RGU' THEN 2 WHEN 'INF' THEN 3 WHEN 'TRA' THEN 4 ELSE 5 END;
    `),
    q<Finanze>(`
      SELECT
        COALESCE(SUM(f.importo_eur), 0)::numeric::float AS tot_generale,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%FSC%'), 0)::numeric::float AS tot_fsc,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%Comune%'), 0)::numeric::float AS tot_comune,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%DL 148%'), 0)::numeric::float AS tot_dl148,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%Amianto%'), 0)::numeric::float AS tot_amianto,
        COALESCE(SUM(f.importo_eur) FILTER (WHERE f.denominazione ILIKE '%DL 185%'
                                              OR f.denominazione ILIKE '%Adp%'), 0)::numeric::float AS tot_altre
      FROM bagnoli_cantieri.fonte_finanziamento f WHERE f.versione_id = 1;
    `),
    q<Gare>(`
      SELECT
        COUNT(*)::int AS totale,
        COUNT(*) FILTER (WHERE stato ILIKE '%aggiudic%' OR data_aggiudicazione IS NOT NULL)::int AS aggiudicate,
        COUNT(*) FILTER (WHERE stato ILIKE '%pubblic%' OR stato ILIKE '%corso%')::int AS in_corso,
        COALESCE(SUM(importo_base_eur), 0)::numeric::float AS importo_totale
      FROM bagnoli_cantieri.attivita_gara WHERE versione_id = 1;
    `),
    q<VersioneRow>(`
      SELECT codice, fonte, versione_label, data_riferimento::text AS data_riferimento, is_ufficiale
      FROM bagnoli_cantieri.cronoprogramma_versione
      ORDER BY data_riferimento DESC LIMIT 1;
    `),
  ]);

  return {
    kpi: kpiR[0] ?? { totale: 0, in_avanzamento: 0, completati: 0, non_iniziati: 0 },
    pctGlobale: Math.round((globR[0]?.pct_globale ?? 0) * 10) / 10,
    aree,
    fin: finR[0] ?? { tot_generale: 0, tot_fsc: 0, tot_comune: 0, tot_dl148: 0, tot_amianto: 0, tot_altre: 0 },
    gare: gareR[0] ?? { totale: 0, aggiudicate: 0, in_corso: 0, importo_totale: 0 },
    versione: verR[0] ?? null,
  };
}

const MACRO_CLASS: Record<string, { cls: string; icon: string; sub: string }> = {
  "Risanamento ambientale": {
    cls: "ra",
    icon: "fa-leaf",
    sub: "Bonifica, arenili, sedimenti, soil washing",
  },
  "Rigenerazione urbana": {
    cls: "ru",
    icon: "fa-city",
    sub: "Parco urbano, waterfront, riqualificazione",
  },
  Infrastrutture: {
    cls: "in",
    icon: "fa-road",
    sub: "Trasporti, idriche, energetiche, TLC",
  },
  "Attività Trasversali": {
    cls: "tr",
    icon: "fa-diagram-project",
    sub: "PRARU, coordinamento, vigilanza, supporto",
  },
};

export default async function Page() {
  const { kpi, pctGlobale, aree, fin, gare, versione } = await loadData();
  const pctRound = Math.round(pctGlobale);

  return (
    <>
      {/* ===== HEADER ===== */}
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="logo">
            <div className="logo-icon">
              <i className="fas fa-city"></i>
            </div>
            <div className="logo-text">
              <h1>Rigenerazione Bagnoli-Coroglio</h1>
              <span>Commissario Straordinario del Governo</span>
            </div>
          </div>
          <nav className="topnav">
            <a href="#avanzamento">Avanzamento</a>
            <a href="#aree">Macro-Aree</a>
            <a href="#finanze">Finanze</a>
            <a href="#gare">Gare</a>
            <a href="#opendata">Open Data</a>
          </nav>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-badge">
            <span className="pulse"></span> Dati aggiornati{" "}
            {versione ? `— ${formatDate(versione.data_riferimento)}` : ""}
          </div>
          <h2>
            Programma di <em>Rigenerazione</em>
            <br />
            Bagnoli-Coroglio
          </h2>
          <p>
            Segui l&apos;avanzamento del programma, lo stato dei lavori per
            macro-area e come vengono utilizzati i fondi pubblici.
          </p>
          <HeroClient
            pct={pctRound}
            kpi={{
              totale: kpi.totale,
              in_avanzamento: kpi.in_avanzamento,
              completati: kpi.completati,
            }}
          />
        </div>
      </section>

      {/* ===== AVANZAMENTO ===== */}
      <section className="section" id="avanzamento">
        <div className="container">
          <div className="sec-head">
            <div className="sec-tag">
              <i className="fas fa-chart-line"></i> Monitoraggio
            </div>
            <h3 className="sec-title">A che punto siamo?</h3>
            <p className="sec-sub">
              Un colpo d&apos;occhio sullo stato di tutti i lavori del Programma
              di Rigenerazione
            </p>
          </div>

          <div className="stato-grid">
            <StatoCard
              color="blue"
              icon="fa-list-check"
              value={kpi.totale}
              label="Attività totali"
            />
            <StatoCard
              color="green"
              icon="fa-circle-check"
              value={kpi.completati}
              label="Completate"
            />
            <StatoCard
              color="orange"
              icon="fa-spinner"
              value={kpi.in_avanzamento}
              label="In corso"
            />
            <StatoCard
              color="red"
              icon="fa-clock"
              value={kpi.non_iniziati}
              label="Da avviare"
            />
          </div>

          <div className="big-progress">
            <h4>
              <i className="fas fa-tasks"></i> Avanzamento complessivo del
              programma
            </h4>
            <ProgressClient pct={pctRound} />
            <div className="bp-legend">
              <span>
                <span className="bp-dot" style={{ background: "var(--green)" }}></span>
                Completate: {formatInt(kpi.completati)}
              </span>
              <span>
                <span className="bp-dot" style={{ background: "var(--blue)" }}></span>
                In corso: {formatInt(kpi.in_avanzamento)}
              </span>
              <span>
                <span className="bp-dot" style={{ background: "var(--orange)" }}></span>
                Da avviare: {formatInt(kpi.non_iniziati)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MACRO-AREE ===== */}
      <section className="section" id="aree">
        <div className="container">
          <div className="sec-head">
            <div className="sec-tag">
              <i className="fas fa-layer-group"></i> Macro-Aree
            </div>
            <h3 className="sec-title">Le macro-aree del programma</h3>
            <p className="sec-sub">
              Quattro grandi filoni di intervento: lo stato complessivo di
              ciascuno con indicatori sintetici
            </p>
          </div>
          <div className="macro-grid">
            {aree.map((a) => {
              const meta = MACRO_CLASS[a.macro_area] ?? {
                cls: "ru",
                icon: "fa-folder",
                sub: "",
              };
              const pctI = Math.round(a.pct_medio ?? 0);
              return (
                <div key={a.macro_area} className={`macro-card ${meta.cls}`}>
                  <div className="macro-banner">
                    <h3>{a.macro_area}</h3>
                    <span className="mc-sub">{meta.sub}</span>
                    <i className={`fas ${meta.icon} mc-icon`}></i>
                  </div>
                  <div className="macro-body">
                    <div className="macro-progress">
                      <div className="mp-head">
                        <span className="mp-label">Avanzamento medio</span>
                        <span className="mp-pct">{formatPct(pctI)}</span>
                      </div>
                      <div className="mp-track">
                        <div
                          className="mp-fill"
                          style={{ width: `${Math.min(pctI, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="macro-kpis">
                      <div className="macro-kpi">
                        <div className="mk-val">{formatInt(a.n_cup)}</div>
                        <div className="mk-lbl">CUP Attivi</div>
                      </div>
                      <div className="macro-kpi">
                        <div className="mk-val">{formatInt(a.totale)}</div>
                        <div className="mk-lbl">Attività</div>
                      </div>
                      <div className="macro-kpi">
                        <div className="mk-val">{formatMeur(a.budget_eur)}</div>
                        <div className="mk-lbl">Budget</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FINANZE ===== */}
      <section className="section" id="finanze">
        <div className="container">
          <div className="sec-head">
            <div className="sec-tag">
              <i className="fas fa-euro-sign"></i> Trasparenza finanziaria
            </div>
            <h3 className="sec-title">Come spendiamo i fondi</h3>
            <p className="sec-sub">
              Totale trasparenza sulle fonti di finanziamento del Programma
              Bagnoli-Coroglio
            </p>
          </div>
          <div className="budget-hero">
            <div className="budget-total">
              <div className="bt-val">{formatMeur(fin.tot_generale)}</div>
              <div className="bt-lbl">Budget complessivo assegnato</div>
              <div className="bt-sub">
                {formatInt(gare.totale)} gare avviate · {formatInt(aree.reduce((s, a) => s + a.n_cup, 0))} CUP
              </div>
            </div>
            <div className="budget-fonti">
              <FonteCard
                label="FSC / PO Ambiente"
                value={fin.tot_fsc}
                total={fin.tot_generale}
                color="#2563eb"
              />
              <FonteCard
                label="Comune di Napoli"
                value={fin.tot_comune}
                total={fin.tot_generale}
                color="#16a34a"
              />
              <FonteCard
                label="DL 148/2017"
                value={fin.tot_dl148}
                total={fin.tot_generale}
                color="#f59e0b"
              />
              <FonteCard
                label="Fondi Amianto MATTM"
                value={fin.tot_amianto}
                total={fin.tot_generale}
                color="#7c3aed"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== GARE ===== */}
      <section className="section" id="gare">
        <div className="container">
          <div className="sec-head">
            <div className="sec-tag">
              <i className="fas fa-gavel"></i> Appalti
            </div>
            <h3 className="sec-title">Gare e procedure di gara</h3>
            <p className="sec-sub">
              Sintesi delle procedure d&apos;appalto avviate per il programma
            </p>
          </div>
          <div className="gare-grid">
            <div className="gara-card">
              <div
                className="gc-icon"
                style={{ background: "var(--blue-light)", color: "var(--blue)" }}
              >
                <i className="fas fa-gavel"></i>
              </div>
              <div className="gc-val">{formatInt(gare.totale)}</div>
              <div className="gc-lbl">Gare totali avviate</div>
            </div>
            <div className="gara-card">
              <div
                className="gc-icon"
                style={{ background: "var(--green-light)", color: "var(--green)" }}
              >
                <i className="fas fa-check-double"></i>
              </div>
              <div className="gc-val">{formatInt(gare.aggiudicate + gare.in_corso)}</div>
              <div className="gc-lbl">Aggiudicate / in corso</div>
            </div>
            <div className="gara-card">
              <div
                className="gc-icon"
                style={{ background: "var(--orange-light)", color: "var(--orange)" }}
              >
                <i className="fas fa-coins"></i>
              </div>
              <div className="gc-val">{formatMeur(gare.importo_totale)}</div>
              <div className="gc-lbl">Importo a base di gara</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== OPEN DATA ===== */}
      <section className="section" id="opendata">
        <div className="container">
          <div className="sec-head">
            <div className="sec-tag">
              <i className="fas fa-download"></i> Dati aperti
            </div>
            <h3 className="sec-title">Scarica i dati</h3>
            <p className="sec-sub">
              Tutti gli indicatori sono disponibili in formato JSON aperto —
              Licenza CC-BY 4.0
            </p>
          </div>
          <div className="od-grid">
            <div className="od-card">
              <div className="od-icon">
                <i className="fas fa-chart-line"></i>
              </div>
              <h5>Avanzamento lavori</h5>
              <p>KPI globali, % per macro-area, budget</p>
              <a className="od-btn" href="/api/public/avanzamento">
                <i className="fas fa-download"></i> Scarica JSON
              </a>
            </div>
            <div className="od-card">
              <div
                className="od-icon"
                style={{ background: "var(--green-light)", color: "var(--green)" }}
              >
                <i className="fas fa-euro-sign"></i>
              </div>
              <h5>Fondi e budget</h5>
              <p>Fonti di finanziamento e importi</p>
              <a
                className="od-btn"
                style={{ background: "var(--green)" }}
                href="/api/public/finanze"
              >
                <i className="fas fa-download"></i> Scarica JSON
              </a>
            </div>
            <div className="od-card">
              <div
                className="od-icon"
                style={{ background: "var(--orange-light)", color: "var(--orange)" }}
              >
                <i className="fas fa-gavel"></i>
              </div>
              <h5>Gare e appalti</h5>
              <p>Procedure e aggiudicazioni</p>
              <a
                className="od-btn"
                style={{ background: "var(--orange)" }}
                href="/api/public/finanze"
              >
                <i className="fas fa-download"></i> Scarica JSON
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Rigenerazione Bagnoli-Coroglio</strong>
            <br />
            Commissario Straordinario del Governo
          </div>
          <div style={{ textAlign: "right" }}>
            <a href="/admin">Area Riservata</a>
            <br />
            <span style={{ fontSize: 11 }}>
              Fonte: {versione?.versione_label ?? "Cronoprogramma interno"} ·{" "}
              {versione ? formatDate(versione.data_riferimento) : ""}
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}

function StatoCard({
  color,
  icon,
  value,
  label,
}: {
  color: "blue" | "green" | "orange" | "red";
  icon: string;
  value: number;
  label: string;
}) {
  return (
    <div className={`stato-card ${color}`}>
      <div className="stato-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="stato-val">{formatInt(value)}</div>
      <div className="stato-lbl">{label}</div>
    </div>
  );
}

function FonteCard({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="fonte-card">
      <div className="fv" style={{ color }}>
        {formatMeur(value)}
      </div>
      <div className="fl">{label}</div>
      <div className="fbar">
        <div
          className="fbar-fill"
          style={{ width: `${pct}%`, background: color }}
        ></div>
      </div>
    </div>
  );
}
