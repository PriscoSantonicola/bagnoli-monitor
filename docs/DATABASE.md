# Bagnoli Monitor — Database Schema

Tutte le tabelle vivono nello schema **`bagnoli_cantieri`** del database
`devbagnolicrm` su Postgres 16 Hetzner.

Il pool `pg` dell'app esegue a ogni nuova connessione:

```sql
SET search_path = bagnoli_cantieri, public;
```

quindi le query dell'app possono omettere il prefisso schema.

Lo schema è versionato nel file `schema_cantieri.sql` (bootstrap iniziale) +
`_schema_6sheets.sql` (estensioni aggiunte in fase di import Excel).

---

## 1. Inventario tabelle

Le tabelle si dividono in 3 gruppi logici:

### 1.1 Tabelle "canoniche" (schema sorgente fornito da admin DB)

| Tabella | Ruolo |
|---|---|
| `cronoprogramma_versione` | Versioni del piano (es. "Excel Marzo 2026", "PDF Dic 2024") |
| `cup` | Codici Unici di Progetto (12 entità) |
| `intervento` | Intervento (unità logica di progetto) |
| `unita_intervento` | Sub-unità dell'intervento |
| `wbs` | Work Breakdown Structure (4 macro-aree) |
| `task` | Attività operative con % avanzamento |
| `task_unita_intervento` | Tabella link task ↔ unità intervento |
| `sintesi_intervento` | Riepilogo finanziario per CUP |
| `fonte_finanziamento` | Fonti finanziamento (FSC, Comune, DL 148, ecc.) |
| `attivita_gara` | Gare d'appalto |
| `interconnessione` | Dipendenze tra task |
| `import_log` | Log di importazione dati |

### 1.2 Tabelle "dump Excel" (ogni sheet replicato)

| Tabella | Ruolo |
|---|---|
| `excel_sheet` | Metadata degli sheet Excel importati |
| `excel_row` | Righe raw (JSONB) di ogni sheet per confronto 1:1 |

### 1.3 Tabelle "strutturate" (per le pagine admin)

| Tabella | Ruolo |
|---|---|
| `cruscotto_task` | 22 task sheet Cruscotto |
| `crono_task` | 325 righe gerarchiche sheet CronoProgramma (42 colonne) |
| `scadenza` | 24 scadenze (GO + STOP) |
| `milestone_point` | 18 punti per SVG timeline |
| `gantt_row` | 233 task Gantt con `ranges` JSONB compressi |
| `gantt_date` | 3304 colonne data mappate su `col_idx` |

---

## 2. Schema tabelle canoniche

### 2.1 `cronoprogramma_versione`

```sql
CREATE TABLE cronoprogramma_versione (
  id             SERIAL PRIMARY KEY,
  codice         VARCHAR(40) UNIQUE NOT NULL,
  fonte          VARCHAR(20),      -- 'EXCEL' | 'PDF' | 'ANAC' ...
  versione_label VARCHAR(40),
  data_riferimento DATE NOT NULL,
  is_ufficiale   BOOLEAN DEFAULT false,
  descrizione    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

**Dati attuali**: 3 versioni seed
- `id=1` → "Excel Monitoraggio Prisco v2.12"
- `id=2` → "Allegato A PDF Dic 2024"
- `id=3` → "Allegato A PDF Dic 2025"

### 2.2 `cup`

```sql
CREATE TABLE cup (
  id                SERIAL PRIMARY KEY,
  codice            VARCHAR(20) UNIQUE NOT NULL,
  codice_combinato  VARCHAR(40),
  tipo              VARCHAR(10),      -- 'PRARU' | 'ALTRO'
  macro_area        VARCHAR(40),      -- 'Risanamento ambientale' | 'Rigenerazione urbana' | 'Attività Trasversali'
  titolo            TEXT NOT NULL,
  tematica          VARCHAR(40),
  note              TEXT,
  attivo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Dati attuali**: 12 CUP
- 5 `Risanamento ambientale` (Colmata, Sedimenti, Bio-phyto, Soil washing, Eternit)
- 6 `Rigenerazione urbana` (Energia, Trasporti, Idriche, 2× Parco Urbano, Waterfront)
- 1 `Attività Trasversali` (PRARU)

### 2.3 `wbs`

```sql
CREATE TABLE wbs (
  id             SERIAL PRIMARY KEY,
  versione_id    INT REFERENCES cronoprogramma_versione(id),
  parent_id      INT REFERENCES wbs(id),
  livello        SMALLINT,           -- 1 = macro-area
  livello_nome   VARCHAR(40),        -- 'macro_area'
  codice         VARCHAR(20),        -- 'RAM', 'RGU', 'INF', 'TRA'
  nome           TEXT,
  cup_id         INT REFERENCES cup(id),
  ordine         INT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

**Dati livello 1** (`versione_id = 1`):
| codice | nome |
|---|---|
| RAM | Risanamento ambientale |
| RGU | Rigenerazione urbana |
| INF | Infrastrutture |
| TRA | Attività Trasversali |

### 2.4 `task`

```sql
CREATE TABLE task (
  id                     SERIAL PRIMARY KEY,
  versione_id            INT REFERENCES cronoprogramma_versione(id),
  intervento_id          INT REFERENCES intervento(id),
  cup_id                 INT REFERENCES cup(id),           -- nullable
  activity_id            VARCHAR(40),                      -- es. "ID15"
  activity_name          TEXT,
  durata_giorni          INT,
  data_inizio            DATE,
  data_fine              DATE,
  inizio_actual          BOOLEAN,
  fine_actual            BOOLEAN,
  percentuale_avanzamento NUMERIC(8,4),                    -- 0–100 o 0–1 a seconda della fonte
  stato                  VARCHAR(30),                      -- 'Avviata', 'CONCLUSA', ...
  is_milestone           BOOLEAN DEFAULT false,
  wbs_id                 INT REFERENCES wbs(id),
  note                   TEXT,
  raw_data               JSONB,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
```

**Dati attuali**: 22 task nella `versione_id = 1`.

### 2.5 `sintesi_intervento`

```sql
CREATE TABLE sintesi_intervento (
  id                         SERIAL PRIMARY KEY,
  versione_id                INT REFERENCES cronoprogramma_versione(id),
  cup_id                     INT REFERENCES cup(id),
  importo_intervento_eur     NUMERIC(14,2),   -- € totale intervento
  importo_somme_disp_eur     NUMERIC(14,2),   -- consuntivo 31/12
  importo_assegnato_eur      NUMERIC(14,2),
  note                       TEXT,
  UNIQUE (versione_id, cup_id)
);
```

### 2.6 `fonte_finanziamento`

```sql
CREATE TABLE fonte_finanziamento (
  id             SERIAL PRIMARY KEY,
  versione_id    INT REFERENCES cronoprogramma_versione(id),
  cup_id         INT REFERENCES cup(id),
  denominazione  VARCHAR(100),    -- 'FSC 2014-2020', 'Comune di Napoli', 'DL 148/2017', 'Amianto', 'DL 185/2004', 'Adp'
  importo_eur    NUMERIC(14,2),
  note           TEXT
);
```

17 righe totali, somma € 443.200.420.

### 2.7 `attivita_gara`

```sql
CREATE TABLE attivita_gara (
  id                    SERIAL PRIMARY KEY,
  versione_id           INT REFERENCES cronoprogramma_versione(id),
  cup_id                INT REFERENCES cup(id),
  cig                   VARCHAR(20),
  oggetto               TEXT,
  procedura             VARCHAR(60),
  aggiudicatario        TEXT,
  importo_base_eur      NUMERIC(14,2),
  importo_aggiudicato_eur NUMERIC(14,2),
  data_pubblicazione    DATE,
  data_aggiudicazione   DATE,
  stato                 VARCHAR(60),
  note                  TEXT
);
```

34 righe, importo base totale € 32.937.126,72.

---

## 3. Schema dump Excel

### 3.1 `excel_sheet`

```sql
CREATE TABLE excel_sheet (
  id           SERIAL PRIMARY KEY,
  sheet_name   TEXT UNIQUE NOT NULL,
  ordine       INT NOT NULL DEFAULT 0,
  nrows        INT NOT NULL DEFAULT 0,
  ncols        INT NOT NULL DEFAULT 0,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 `excel_row`

```sql
CREATE TABLE excel_row (
  id        BIGSERIAL PRIMARY KEY,
  sheet_id  INT NOT NULL REFERENCES excel_sheet(id) ON DELETE CASCADE,
  row_idx   INT NOT NULL,
  cells     JSONB NOT NULL DEFAULT '[]'::jsonb    -- array ordinato di valori
);

CREATE INDEX idx_excel_row_sheet ON excel_row(sheet_id, row_idx);
```

---

## 4. Schema tabelle admin

### 4.1 `cruscotto_task`

```sql
CREATE TABLE cruscotto_task (
  id                  SERIAL PRIMARY KEY,
  id_crono            TEXT,              -- "2", "5", "10", "15" ...
  obiettivo_generale  TEXT,              -- 'Risanamento ambientale' | ...
  obiettivi_specifici TEXT,
  azioni              TEXT,
  sub_ambito          TEXT,              -- 'Interno' | 'Esterno'
  superficie          TEXT,              -- 'Ex Eternit', 'Parco Urbano', ...
  area_tematica       TEXT,
  unita_intervento    TEXT,
  tipologia           TEXT,              -- 'A - Procedimento' ...
  attivita            TEXT,              -- 'Avviata' | 'CONCLUSA' | 'Non avviata'
  inizio              DATE,
  fine                DATE,
  durata_giorni       INT,
  pct_avanzamento     NUMERIC(6,4),      -- 0–1
  row_idx             INT NOT NULL
);

CREATE INDEX idx_cruscotto_row ON cruscotto_task(row_idx);
```

**Dati attuali**: 22 task fedeli alle righe R11–R32 del foglio Cruscotto.

### 4.2 `crono_task`

Tabella estesa (42 colonne) con tutti i metadati slicer dello sheet
CronoProgramma.

Campi principali:

```sql
CREATE TABLE crono_task (
  id                 SERIAL PRIMARY KEY,
  id_path            TEXT,          -- "6", "6.1", "6.1.2" (gerarchia)
  livello            INT,           -- 1, 2, 3 basato su conteggio "."
  star_marker        TEXT,          -- '*' sui nodi top-level
  obiettivo_generale TEXT,
  obiettivi_specifici TEXT,
  azioni             TEXT,
  sub_ambito         TEXT,
  superficie         TEXT,
  area_tematica      TEXT,
  unita_intervento   TEXT,
  cup1, cup2, cup3   TEXT,
  interventi_praru   TEXT,
  tipologia          TEXT,          -- 'A - Procedimento' ... 'F - Step 1'
  settore_intervento TEXT,
  tipologia_intervento TEXT,
  stato_proc_amm     TEXT,          -- 'Definito' | 'da Definire'
  contratto          TEXT,          -- 'Accordo Quadro' | 'Appalto' | 'Altro'
  oggetto            TEXT,          -- 'Integrato' | 'Lavori'
  livello_proc       TEXT,          -- 'Progettazione' | 'Esecuzione' | ...
  sub_livello_proc   TEXT,
  processo           TEXT,
  a_procedimento, b_sub_procedimento, c_fase,
  d_sub_fase, e_step, f_step1, g_step2, h_step3 TEXT,
  milestone          TEXT,
  durata_giorni      INT,
  pct_durata         NUMERIC(12,6),
  tipo_attivita      TEXT,
  data_inizio        DATE,
  data_fine          DATE,
  attivita           TEXT,
  gg_avanzamento     INT,
  gg_mancanti        INT,
  pct_avanzamento    NUMERIC(12,6),
  n_interconnessioni INT,
  raw                JSONB,
  row_idx            INT NOT NULL
);
```

**Dati attuali**: 325 righe (162 liv. 1 + 163 liv. 2).

### 4.3 `scadenza`

```sql
CREATE TABLE scadenza (
  id                 SERIAL PRIMARY KEY,
  tipo               TEXT NOT NULL,          -- 'GO' | 'STOP'
  data_evento        DATE,
  a_procedimento     TEXT,
  b_sub_procedimento TEXT,
  c_fase             TEXT,
  d_sub_fase         TEXT,
  e_step             TEXT,
  f_step_1           TEXT,
  row_idx            INT
);

CREATE INDEX idx_scadenza_tipo ON scadenza(tipo, data_evento);
```

**Dati attuali**: 12 GO + 12 STOP.

### 4.4 `milestone_point`

```sql
CREATE TABLE milestone_point (
  id                  SERIAL PRIMARY KEY,
  obiettivo_generale  TEXT,
  obiettivi_specifici TEXT,
  azioni              TEXT,
  superficie          TEXT,
  id_task             TEXT,
  data_milestone      DATE,
  posizione           INT,          -- usata per Y-axis SVG: >0 sopra timeline, <0 sotto
  etichetta           TEXT
);

CREATE INDEX idx_milestone_data ON milestone_point(data_milestone);
```

**Dati attuali**: 18 punti (10 Risanamento sopra + 5 Realizzazione sotto + 3 altri).

### 4.5 `gantt_row`

```sql
CREATE TABLE gantt_row (
  id                 SERIAL PRIMARY KEY,
  row_idx            INT NOT NULL,
  obiettivo_generale TEXT,
  obiettivi_specifici TEXT,
  azioni             TEXT,
  sub_ambito         TEXT,
  fase               TEXT,
  ranges             JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_gantt_row ON gantt_row(row_idx);
```

**Struttura `ranges`** (JSONB array di oggetti):

```json
[
  { "start": "2022-01-03", "end": "2023-02-27" },
  { "start": "2023-03-15", "end": "2023-11-30" }
]
```

**Dati attuali**: 233 righe (228 con almeno 1 range).

### 4.6 `gantt_date`

Mappa indice colonna → giorno calendario (per ricostruire le etichette
dell'asse X del Gantt).

```sql
CREATE TABLE gantt_date (
  col_idx           INT PRIMARY KEY,
  data_giorno       DATE,
  anno              INT,
  mese_nome         TEXT,        -- 'Gen', 'Feb', ...
  giorno_settimana  TEXT         -- 'L', 'M', ...
);
```

**Dati attuali**: 3304 righe (dal 2021-10-07 al 2030-06-30).

---

## 5. Relazioni principali

```
cronoprogramma_versione  (1)────────┐
    │                               │
    ▼ (versione_id)                 │
 wbs ─(cup_id)──▶ cup  ─(cup_id)──▶ task
                    │                   │
                    │                   ├─▶ task_unita_intervento
                    │                   ▼
                    ▼                   unita_intervento
              sintesi_intervento                 ▲
                    │                            │
                    └─ fonte_finanziamento       │
                    │                            │
                    ▼                            │
              attivita_gara ───────(cup_id)─────┘
```

---

## 6. Indici e performance

Indici principali:

| Tabella | Indice |
|---|---|
| `task` | `(versione_id)`, `(wbs_id)`, `(cup_id)` |
| `sintesi_intervento` | `UNIQUE (versione_id, cup_id)` |
| `excel_row` | `(sheet_id, row_idx)` |
| `scadenza` | `(tipo, data_evento)` |
| `milestone_point` | `(data_milestone)` |
| `gantt_row` | `(row_idx)` |

Query d'aggregato tipica (`/api/public/avanzamento`): ~15 ms su dataset
attuale (< 400 righe totali). Non servono indici ulteriori per il traffico
atteso.

---

## 7. Evoluzione schema

### 7.1 Multi-versione

Le tabelle canoniche hanno `versione_id` predisposto per supportare snapshot
storici (es. Excel Mar 2026 vs Excel Giu 2026). L'app corrente filtra
**sempre** `WHERE versione_id = 1`. Per attivare multi-versione:

1. Aggiungere selector UI (dropdown).
2. Passare `versione_id` come prop nel page.
3. Parametrizzare le query.

### 7.2 Nuovi sheet Excel

L'architettura tabella `excel_sheet` + `excel_row` accetta qualsiasi sheet
aggiuntivo senza modifiche DDL — basta rilanciare l'importer
(`_import_excel_all_sheets.py`).

### 7.3 Tabella `user` / `session`

Attualmente l'auth è stateless (cookie firmato). Se nascesse l'esigenza
di audit / revoca sessione:

```sql
CREATE TABLE session (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INT NOT NULL,
  issued_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  user_agent    TEXT,
  ip            INET
);
```

E aggiornare il middleware per verificare anche il `session.id` contenuto
nel payload.

---

## 8. Backup & migrazioni

Il DB è gestito da admin esterno (Hetzner). I backup sono sotto la sua
responsabilità. Per il nostro codice:

- Lo script `_apply_schema_hetzner.py` applica idempotentemente il DDL.
- Gli importer `_import_*.py` eseguono `TRUNCATE ... RESTART IDENTITY`
  prima di ricaricare, quindi un errore non lascia stato sporco.
- Non abbiamo strumenti di migrazione tipo Flyway / Alembic — le evoluzioni
  schema vengono fatte a mano con `ALTER TABLE`.
