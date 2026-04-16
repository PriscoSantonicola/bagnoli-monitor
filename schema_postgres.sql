-- =====================================================================
-- SCHEMA POSTGRESQL — BAGNOLI MONITOR (versione minimale, no PostGIS)
-- =====================================================================
-- Nessuna estensione geospaziale: lat/lon come NUMERIC(10,7).
-- Leaflet lato front gestisce rendering/filtri spaziali.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS bagnoli;
SET search_path = bagnoli, public;

-- 1. CUP
CREATE TABLE cup (
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
CREATE INDEX idx_cup_macro        ON cup(macro_area);
CREATE INDEX idx_cup_tipo         ON cup(tipo);
CREATE INDEX idx_cup_titolo_trgm  ON cup USING gin (titolo gin_trgm_ops);

-- 2. Versione cronoprogramma (snapshot)
CREATE TABLE cronoprogramma_versione (
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
CREATE INDEX idx_versione_data ON cronoprogramma_versione(data_riferimento);

-- 3. Intervento (ricorsivo)
CREATE TABLE intervento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES cup(id) ON DELETE RESTRICT,
    parent_id       INT REFERENCES intervento(id) ON DELETE RESTRICT,
    livello         SMALLINT NOT NULL,
    codice          VARCHAR(100),
    nome            TEXT NOT NULL,
    ordine          INT,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_intervento_versione ON intervento(versione_id);
CREATE INDEX idx_intervento_cup      ON intervento(cup_id);
CREATE INDEX idx_intervento_parent   ON intervento(parent_id);

-- 4. Task
CREATE TABLE task (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    intervento_id   INT REFERENCES intervento(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES cup(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_task_versione  ON task(versione_id);
CREATE INDEX idx_task_cup       ON task(cup_id);
CREATE INDEX idx_task_interv    ON task(intervento_id);
CREATE INDEX idx_task_dates     ON task(data_inizio, data_fine);
CREATE INDEX idx_task_activity  ON task(activity_id);
CREATE INDEX idx_task_milestone ON task(is_milestone) WHERE is_milestone = TRUE;
CREATE INDEX idx_task_name_trgm ON task USING gin (activity_name gin_trgm_ops);

-- 5. WBS (9 livelli)
CREATE TABLE wbs (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    parent_id       INT REFERENCES wbs(id) ON DELETE RESTRICT,
    livello         SMALLINT NOT NULL,
    livello_nome    VARCHAR(30) NOT NULL,
    codice          VARCHAR(50),
    nome            TEXT NOT NULL,
    cup_id          INT REFERENCES cup(id),
    ordine          INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wbs_versione ON wbs(versione_id);
CREATE INDEX idx_wbs_parent   ON wbs(parent_id);
CREATE INDEX idx_wbs_livello  ON wbs(livello);

ALTER TABLE task ADD CONSTRAINT fk_task_wbs FOREIGN KEY (wbs_id) REFERENCES wbs(id) ON DELETE SET NULL;
CREATE INDEX idx_task_wbs ON task(wbs_id);

-- 6. Fonte di finanziamento
CREATE TABLE fonte_finanziamento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES cup(id) ON DELETE RESTRICT,
    denominazione   VARCHAR(200) NOT NULL,
    tipologia       VARCHAR(100),
    importo_eur     NUMERIC(15,2) NOT NULL,
    anno_competenza INT,
    delibera        VARCHAR(200),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fonte_cup      ON fonte_finanziamento(cup_id);
CREATE INDEX idx_fonte_versione ON fonte_finanziamento(versione_id);

-- 7. Sintesi intervento
CREATE TABLE sintesi_intervento (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES cup(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_sintesi_cup ON sintesi_intervento(cup_id);

-- 8. Attivita gara
CREATE TABLE attivita_gara (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    cup_id          INT REFERENCES cup(id) ON DELETE RESTRICT,
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
CREATE INDEX idx_gara_cup ON attivita_gara(cup_id);
CREATE INDEX idx_gara_cig ON attivita_gara(cig);

-- 9. Unita di intervento (GIS minimale: lat/lon)
CREATE TABLE unita_intervento (
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
CREATE INDEX idx_ui_latlon ON unita_intervento(lat, lon);

-- 10. Relazione task <-> unita intervento
CREATE TABLE task_unita_intervento (
    task_id         INT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    unita_id        INT NOT NULL REFERENCES unita_intervento(id) ON DELETE RESTRICT,
    ruolo           VARCHAR(50),
    note            TEXT,
    PRIMARY KEY (task_id, unita_id)
);

-- 11. Interconnessione
CREATE TABLE interconnessione (
    id              SERIAL PRIMARY KEY,
    versione_id     INT NOT NULL REFERENCES cronoprogramma_versione(id) ON DELETE RESTRICT,
    task_predecessore_id INT REFERENCES task(id) ON DELETE CASCADE,
    task_successore_id   INT REFERENCES task(id) ON DELETE CASCADE,
    tipo_legame     VARCHAR(10),
    lag_giorni      INT DEFAULT 0,
    descrizione     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (task_predecessore_id <> task_successore_id)
);
CREATE INDEX idx_inter_pre ON interconnessione(task_predecessore_id);
CREATE INDEX idx_inter_suc ON interconnessione(task_successore_id);

-- 12. Import log
CREATE TABLE import_log (
    id              SERIAL PRIMARY KEY,
    versione_id     INT REFERENCES cronoprogramma_versione(id) ON DELETE SET NULL,
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

-- =====================================================================
-- VISTE
-- =====================================================================
CREATE OR REPLACE VIEW v_confronto_versioni AS
SELECT
    c.codice                               AS cup,
    c.titolo                               AS cup_titolo,
    v.codice                               AS versione,
    v.data_riferimento                     AS data_snapshot,
    MIN(t.data_inizio)                     AS inizio_min,
    MAX(t.data_fine)                       AS fine_max,
    COUNT(t.id)                            AS n_task,
    SUM(CASE WHEN t.fine_actual THEN 1 ELSE 0 END) AS task_completati,
    ROUND(100.0 * SUM(CASE WHEN t.fine_actual THEN 1 ELSE 0 END) / NULLIF(COUNT(t.id),0), 1) AS pct_completati
FROM cup c
LEFT JOIN task t ON t.cup_id = c.id
LEFT JOIN cronoprogramma_versione v ON v.id = t.versione_id
GROUP BY c.codice, c.titolo, v.codice, v.data_riferimento
ORDER BY c.codice, v.data_riferimento;

CREATE OR REPLACE VIEW v_avanzamento_macroarea AS
SELECT
    c.macro_area,
    v.codice                               AS versione,
    COUNT(DISTINCT c.id)                   AS n_cup,
    COUNT(t.id)                            AS n_task,
    SUM(CASE WHEN t.fine_actual THEN 1 ELSE 0 END) AS task_completati,
    SUM(CASE WHEN t.inizio_actual AND NOT t.fine_actual THEN 1 ELSE 0 END) AS task_in_corso,
    ROUND(100.0 * SUM(CASE WHEN t.fine_actual THEN 1 ELSE 0 END) / NULLIF(COUNT(t.id),0), 1) AS pct_completamento
FROM cup c
LEFT JOIN task t ON t.cup_id = c.id
LEFT JOIN cronoprogramma_versione v ON v.id = t.versione_id
WHERE v.is_ufficiale = TRUE
GROUP BY c.macro_area, v.codice
ORDER BY c.macro_area, v.codice;

CREATE OR REPLACE VIEW v_finanziamento_cup AS
SELECT
    c.codice,
    c.titolo,
    COUNT(f.id)                            AS n_fonti,
    SUM(f.importo_eur)                     AS totale_eur
FROM cup c
LEFT JOIN fonte_finanziamento f ON f.cup_id = c.id
GROUP BY c.codice, c.titolo
ORDER BY totale_eur DESC NULLS LAST;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cup_upd  BEFORE UPDATE ON cup              FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_task_upd BEFORE UPDATE ON task             FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_ui_upd   BEFORE UPDATE ON unita_intervento FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Seed versioni
INSERT INTO cronoprogramma_versione (codice, fonte, versione_label, data_riferimento, is_ufficiale, descrizione) VALUES
  ('EXCEL-PRISCO-2.12', 'EXCEL', 'Ver. 2.12', '2024-01-01', FALSE, 'Foglio operativo interno Prisco'),
  ('PDF-2024-12',       'PDF',   'agg.to dic 2024 Definitivo', '2024-12-01', TRUE,  'Allegato A ufficiale dicembre 2024'),
  ('PDF-2025-12',       'PDF',   'agg.to dic 2025',            '2025-12-01', TRUE,  'Allegato A ufficiale dicembre 2025')
ON CONFLICT (codice) DO NOTHING;
