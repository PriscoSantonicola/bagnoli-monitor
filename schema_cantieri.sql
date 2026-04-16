-- =====================================================================
-- SCHEMA bagnoli_cantieri (DB Hetzner devbagnolicrm)
-- =====================================================================
-- Adattato da schema_postgres.sql: stesse tabelle, schema diverso,
-- niente CREATE SCHEMA (esiste gia'), niente CREATE EXTENSION globale
-- (utente non ha permessi su pg_catalog).
-- =====================================================================

SET search_path = bagnoli_cantieri, public;

-- 1. CUP
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.cup (
    id              SERIAL PRIMARY KEY,
    codice          VARCHAR(50)  NOT NULL UNIQUE,
    codice_combinato VARCHAR(100),
    tipo            VARCHAR(30)  NOT NULL,
    macro_area      VARCHAR(120),
    titolo          TEXT         NOT NULL,
    tematica        VARCHAR(120),
    note            TEXT,
    attivo          BOOLEAN      DEFAULT TRUE,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cup_macro ON bagnoli_cantieri.cup(macro_area);
CREATE INDEX IF NOT EXISTS idx_cup_tipo  ON bagnoli_cantieri.cup(tipo);

-- 2. Versione cronoprogramma (snapshot)
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.cronoprogramma_versione (
    id              SERIAL PRIMARY KEY,
    codice          VARCHAR(30)  NOT NULL UNIQUE,
    fonte           VARCHAR(20)  NOT NULL,
    versione_label  VARCHAR(50),
    data_riferimento DATE        NOT NULL,
    data_import     TIMESTAMPTZ  DEFAULT NOW(),
    file_origine    TEXT,
    hash_file       VARCHAR(64),
    descrizione     TEXT,
    is_ufficiale    BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_versione_data ON bagnoli_cantieri.cronoprogramma_versione(data_riferimento);

-- 3. Intervento (ricorsivo)
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.intervento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id) ON DELETE RESTRICT,
    parent_id       INT REFERENCES bagnoli_cantieri.intervento(id) ON DELETE RESTRICT,
    livello         SMALLINT NOT NULL,
    codice          VARCHAR(100),
    nome            TEXT NOT NULL,
    ordine          INT,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intervento_versione ON bagnoli_cantieri.intervento(versione_id);
CREATE INDEX IF NOT EXISTS idx_intervento_cup      ON bagnoli_cantieri.intervento(cup_id);
CREATE INDEX IF NOT EXISTS idx_intervento_parent   ON bagnoli_cantieri.intervento(parent_id);

-- 4. Task
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.task (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    intervento_id   INT REFERENCES bagnoli_cantieri.intervento(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id) ON DELETE RESTRICT,
    activity_id     VARCHAR(50),
    activity_name   TEXT NOT NULL,
    durata_giorni   INT,
    data_inizio     DATE,
    data_fine       DATE,
    inizio_actual   BOOLEAN DEFAULT FALSE,
    fine_actual     BOOLEAN DEFAULT FALSE,
    percentuale_avanzamento NUMERIC(5,2),
    stato           VARCHAR(30),
    is_milestone    BOOLEAN DEFAULT FALSE,
    wbs_id          INT,
    note            TEXT,
    raw_data        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_versione  ON bagnoli_cantieri.task(versione_id);
CREATE INDEX IF NOT EXISTS idx_task_cup       ON bagnoli_cantieri.task(cup_id);
CREATE INDEX IF NOT EXISTS idx_task_interv    ON bagnoli_cantieri.task(intervento_id);
CREATE INDEX IF NOT EXISTS idx_task_dates     ON bagnoli_cantieri.task(data_inizio, data_fine);
CREATE INDEX IF NOT EXISTS idx_task_activity  ON bagnoli_cantieri.task(activity_id);
CREATE INDEX IF NOT EXISTS idx_task_milestone ON bagnoli_cantieri.task(is_milestone) WHERE is_milestone = TRUE;

-- 5. WBS
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.wbs (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    parent_id       INT REFERENCES bagnoli_cantieri.wbs(id) ON DELETE RESTRICT,
    livello         SMALLINT NOT NULL,
    livello_nome    VARCHAR(30) NOT NULL,
    codice          VARCHAR(50),
    nome            TEXT NOT NULL,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id),
    ordine          INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wbs_versione ON bagnoli_cantieri.wbs(versione_id);
CREATE INDEX IF NOT EXISTS idx_wbs_parent   ON bagnoli_cantieri.wbs(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_livello  ON bagnoli_cantieri.wbs(livello);

-- FK deferred
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_task_wbs') THEN
    ALTER TABLE bagnoli_cantieri.task ADD CONSTRAINT fk_task_wbs
      FOREIGN KEY (wbs_id) REFERENCES bagnoli_cantieri.wbs(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_task_wbs ON bagnoli_cantieri.task(wbs_id);

-- 6. Fonte di finanziamento
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.fonte_finanziamento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id) ON DELETE RESTRICT,
    denominazione   VARCHAR(200) NOT NULL,
    tipologia       VARCHAR(100),
    importo_eur     NUMERIC(15,2) NOT NULL,
    anno_competenza INT,
    delibera        VARCHAR(200),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fonte_cup      ON bagnoli_cantieri.fonte_finanziamento(cup_id);

-- 7. Sintesi intervento
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.sintesi_intervento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id) ON DELETE RESTRICT,
    soggetto_attuatore VARCHAR(200),
    stazione_appaltante VARCHAR(200),
    importo_intervento_eur NUMERIC(15,2),
    importo_lavori_eur   NUMERIC(15,2),
    importo_somme_disp_eur NUMERIC(15,2),
    data_inizio_prevista DATE,
    data_fine_prevista   DATE,
    stato_procedurale    VARCHAR(100),
    rup                  VARCHAR(200),
    descrizione          TEXT,
    raw_data             JSONB,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sintesi_cup ON bagnoli_cantieri.sintesi_intervento(cup_id);

-- 8. Attivita gara
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.attivita_gara (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES bagnoli_cantieri.cup(id) ON DELETE RESTRICT,
    cig             VARCHAR(50),
    oggetto         TEXT,
    procedura       VARCHAR(100),
    importo_base_eur NUMERIC(15,2),
    importo_aggiudicazione_eur NUMERIC(15,2),
    ribasso_pct     NUMERIC(5,2),
    aggiudicatario  VARCHAR(200),
    data_pubblicazione DATE,
    data_scadenza    DATE,
    data_aggiudicazione DATE,
    data_contratto   DATE,
    stato           VARCHAR(50),
    note            TEXT,
    raw_data        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gara_cup ON bagnoli_cantieri.attivita_gara(cup_id);

-- 9. Unita di intervento (GIS minimale)
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.unita_intervento (
    id              SERIAL PRIMARY KEY,
    codice          VARCHAR(50) NOT NULL UNIQUE,
    nome            VARCHAR(200) NOT NULL,
    tipologia       VARCHAR(100),
    descrizione     TEXT,
    lat             NUMERIC(10,7),
    lon             NUMERIC(10,7),
    area_mq         NUMERIC(15,2),
    perimetro_geojson JSONB,
    indirizzo       VARCHAR(300),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ui_latlon ON bagnoli_cantieri.unita_intervento(lat, lon);

-- 10. Relazione task <-> unita intervento
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.task_unita_intervento (
    task_id         INT NOT NULL REFERENCES bagnoli_cantieri.task(id) ON DELETE CASCADE,
    unita_id        INT NOT NULL REFERENCES bagnoli_cantieri.unita_intervento(id) ON DELETE RESTRICT,
    ruolo           VARCHAR(50),
    note            TEXT,
    PRIMARY KEY (task_id, unita_id)
);

-- 11. Interconnessione
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.interconnessione (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE RESTRICT,
    task_predecessore_id INT REFERENCES bagnoli_cantieri.task(id) ON DELETE CASCADE,
    task_successore_id   INT REFERENCES bagnoli_cantieri.task(id) ON DELETE CASCADE,
    tipo_legame     VARCHAR(10),
    lag_giorni      INT DEFAULT 0,
    descrizione     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (task_predecessore_id <> task_successore_id)
);

-- 12. Import log
CREATE TABLE IF NOT EXISTS bagnoli_cantieri.import_log (
    id              SERIAL PRIMARY KEY,
    versione_id     INT REFERENCES bagnoli_cantieri.cronoprogramma_versione(id) ON DELETE SET NULL,
    file_nome       TEXT,
    righe_lette     INT,
    righe_inserite  INT,
    righe_aggiornate INT,
    righe_ignorate  INT,
    errori          JSONB,
    durata_sec      NUMERIC(8,2),
    operatore       VARCHAR(100),
    eseguito_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed versioni (idempotente)
INSERT INTO bagnoli_cantieri.cronoprogramma_versione (codice, fonte, versione_label, data_riferimento, is_ufficiale, descrizione) VALUES
  ('EXCEL-PRISCO-2.12', 'EXCEL', 'Ver. 2.12', '2024-01-01', FALSE, 'Foglio operativo interno Prisco'),
  ('PDF-2024-12',       'PDF',   'agg.to dic 2024 Definitivo', '2024-12-01', TRUE,  'Allegato A ufficiale dicembre 2024'),
  ('PDF-2025-12',       'PDF',   'agg.to dic 2025',            '2025-12-01', TRUE,  'Allegato A ufficiale dicembre 2025')
ON CONFLICT (codice) DO NOTHING;
