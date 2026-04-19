# Bagnoli Monitor — Pipeline Import Dati

Descrizione di come i dati del Commissariato vengono caricati in DB
a partire dal file Excel sorgente.

---

## 1. File sorgente

- **Path**: `C:\Users\user\Desktop\Webgo\TRAPANI\PROGETTI\MONITORAGGIO Cronoprogramma Prisco Ver. 2.12.xlsx`
- **Dimensione**: ~18 MB
- **Fogli**: 19 in totale, di cui 6 di interesse (Cruscotto, CronoProgramma,
  Scadenze GO, Scadenze STOP, Timeline - MILESTONE, Gantt).
- **Proprietà**: versione ufficiale fornita dall'admin Commissariato.

Eventuali PDF (Allegato A 2024, 2025) coesistono nella stessa cartella ma
**non** vengono importati automaticamente — servono come riferimento
storico.

---

## 2. Strumenti

Tutti gli import sono script Python stand-alone. **Non** girano dentro il
container applicativo: sono strumenti di sviluppo eseguiti on-demand.

Requisiti:

```bash
pip install openpyxl psycopg2-binary paramiko
```

Connessione al DB usata nei script:

```python
HOST = "hetzner-dbserver-dev.sviluppo-sw.it"
PORT = 5432
DB   = "devbagnolicrm"
USER = "devbagnolicrm"
PASS = "<vedi secrets.md>"
```

---

## 3. Pipeline completa (da zero)

### 3.1 Applica schema DDL

```bash
python _apply_schema_hetzner.py
```

Applica `schema_cantieri.sql` al DB Hetzner (idempotente, usa
`CREATE TABLE IF NOT EXISTS`).

### 3.2 Importa tutti i 14 sheet Excel come dump raw

```bash
python _import_excel_all_sheets.py
```

Popola `excel_sheet` + `excel_row`. Utile per l'admin UI che mostra ogni
sheet 1:1.

Output:
```
[schema] ok
[excel] 19 sheet
[wipe] ok
  [ok] 'Appoggio GIS'    28r x 8c
  [ok] 'Proc Amm.vo'     14r x 10c
  [ok] 'Cruscotto'       32r x 55c
  ...
[done] sheet=14 rows=488
```

### 3.3 Importa gli strutturati per i 6 sheet target

```bash
python _import_6sheets.py
```

Popola le tabelle strutturate:

- `cruscotto_task` (22 righe)
- `crono_task` (325 righe, 42 colonne)
- `scadenza` (24 righe: 12 GO + 12 STOP)
- `milestone_point` (18 righe)
- `gantt_row` (233 righe) + `gantt_date` (3304 righe)

### 3.4 Cross-check

```bash
python _crosscheck_excel_db.py
```

Confronta cella per cella Excel vs DB. Output atteso:

```
TOTALE: 1182 check,  1182 OK,  0 FAIL
```

Un FAIL indica una discrepanza e richiede investigazione prima di
considerare l'import valido.

---

## 4. Script di import — dettagli

### 4.1 `_import_excel_all_sheets.py`

Flow:

```
1. Connetti a Postgres.
2. Applica _schema_excel_dump.sql (CREATE IF NOT EXISTS).
3. Carica workbook openpyxl (read_only=True, data_only=True).
4. PER ogni sheet in wb.sheetnames:
     - Skip se in EXCLUDE (Gantt, CronoProgramma, sheet vuoti)
     - Trim righe vuote in coda
     - INSERT in excel_sheet (nome, ordine, nrows, ncols)
     - execute_values batch INSERT in excel_row (sheet_id, row_idx, cells JSONB)
5. Commit finale.
```

Gestione celle speciali:

- `None` → `null` JSON
- `datetime` / `date` → ISO-8601 string
- altri tipi → `str(v)`

Cap: 20.000 righe per sheet per evitare out-of-memory su sheet patologici.

### 4.2 `_import_6sheets.py`

Orchestratore per i 6 sheet strutturati. Chiama 5 funzioni specifiche:

#### `import_cruscotto(wb, cur)`

- Scansiona righe R11–R35 del foglio Cruscotto.
- Estrae 14 colonne (C0–C13) in `cruscotto_task`.
- TRUNCATE + INSERT batch.

#### `import_cronoprogramma(wb, cur)`

- Scansiona righe R3+ del foglio CronoProgramma.
- Mapping di 42 colonne, inclusi i filtri slicer (Tipologia, Stato Proc,
  CONTRATTO, Oggetto, Livello, Sub Livello).
- Calcola `livello` come `id_path.count(".") + 1`.
- `raw` JSONB conserva le prime 45 celle per debug.

#### `import_scadenze(wb, cur)`

- Due chiamate: 'GO' + 'STOP'.
- Parsing identico (stesso layout), `tipo` distingue.
- Salta righe senza `data_evento`.

#### `import_milestone(wb, cur)`

- Righe R5+ di `Timeline - MILESTONE`.
- Estrae posizione (Y-axis per SVG) ed etichetta.

#### `import_gantt(wb, cur)`

Il più complesso:

```
1. Leggi R1 (anni), R2 (mesi), R3 (date), R4 (giorno settimana).
2. Propaga anno/mese alle colonne intermedie (le celle Excel sono sparse).
3. Popola gantt_date: per ogni col 5..3308 con date valida →
   (col_idx, data_giorno, anno, mese_nome, giorno_settimana).
4. PER ogni riga task (R5..R237):
     - Categorie: C0–C4
     - Scan colonne 5..3308: se cella == "X", accumula col_idx in x_cols
     - Comprimi x_cols in range contigui (RLE)
     - Converti ogni range (start_col, end_col) in (start_date, end_date)
     - Salva gantt_row con ranges JSONB array
```

Vedi `docs/ALGORITHMS.md § 4` per la matematica dell'RLE.

---

## 5. Idempotenza

Tutti gli script:

- Usano `CREATE TABLE IF NOT EXISTS` nei DDL.
- Fanno `TRUNCATE ... RESTART IDENTITY` prima di re-popolare (evita
  duplicati su rirun).

Quindi si possono eseguire più volte senza stato sporco.

---

## 6. Encoding issues risolti

### 6.1 Caratteri accentati

openpyxl ritorna stringhe UTF-8 corrette (es. `Attività Trasversali`).
Il display sul terminale Windows CP1252 mostra `Attivit?` ma il DB salva
correttamente. Vedi `docs/ALGORITHMS.md § 13` per il cross-check che
conferma l'integrità dell'encoding.

### 6.2 Celle numeriche 0 vs vuote

Alcune celle Excel contengono `0` integer come placeholder "(vuoto)" in
slicer Excel. Il crosscheck iniziale segnalava `Excel=None DB="0"` ma era
un bug dello script di verifica (`if row[1]` valuta 0 come falsy). Fix:
usare `if row[1] is not None` invece di `if row[1]`.

### 6.3 Percentuali 0–1 vs 0–100

- `cruscotto_task.pct_avanzamento` è stored 0–1 (es. 0.2238 per 22.38%).
- `task.percentuale_avanzamento` è stored 0–100 (es. 22.38).

Le pagine admin moltiplicano/dividono dove serve. Il confronto crosscheck
tiene conto di questo usando tolleranza numerica.

---

## 7. Quando rifare l'import

Ogni volta che:

- L'admin Commissariato fornisce una nuova revisione dell'Excel.
- Si corregge un bug nel parser.
- Si aggiunge una colonna nuova allo schema DB.

Procedura:

```bash
# 1. Ricevere nuovo Excel, salvarlo in
# C:\Users\user\Desktop\Webgo\TRAPANI\PROGETTI\MONITORAGGIO Cronoprogramma Prisco Ver. X.Y.xlsx

# 2. Aggiornare path EXCEL nei script se cambia nome file

# 3. Rirun:
python _import_excel_all_sheets.py
python _import_6sheets.py

# 4. Crosscheck:
python _crosscheck_excel_db.py
# Atteso: 0 FAIL

# 5. Verifica live:
curl https://monitoraggio.analist24.it.com/api/public/avanzamento | python3 -m json.tool
```

No restart dell'app richiesto: le query dell'app sono `force-dynamic` e
leggono sempre dal DB aggiornato.

---

## 8. Estensione: nuovi sheet

Per importare un nuovo foglio Excel che non è tra i 6 attuali:

1. Verificare che `_import_excel_all_sheets.py` non lo abbia nell'array
   `EXCLUDE`. Se sì, rimuovere.
2. Ri-runnare l'importer: verrà aggiunto a `excel_sheet` + `excel_row` in
   automatico.
3. Per esporlo nell'admin UI, creare una pagina dedicata in
   `src/app/admin/sheet/<slug>/page.tsx` (vedi `docs/ARCHITECTURE.md § 4`
   per la struttura).

---

## 9. Estensione: nuovo campo strutturato

Se l'Excel introduce una colonna nuova nello sheet CronoProgramma (es.
"Responsabile"):

1. Aggiungere la colonna al DDL `_schema_6sheets.sql`:
   ```sql
   ALTER TABLE crono_task ADD COLUMN responsabile TEXT;
   ```
2. Applicare via `psql` o `_apply_schema_hetzner.py` (estendendo).
3. Aggiornare `import_cronoprogramma(...)` in `_import_6sheets.py` per
   leggere la colonna:
   ```python
   to_str(g(42))  # nuovo col_idx
   ```
4. Aggiornare gli INSERT tuple + template `%s` count.
5. Ri-runnare import + crosscheck.
6. Estendere la pagina admin `cronoprogramma/page.tsx` per mostrare il
   campo (nuova colonna `<th>` + `<td>`).

---

## 10. Troubleshooting

### 10.1 `psycopg2.errors.NumericValueOutOfRange`

```
A field with precision 6, scale 4 must round to an absolute value less than 10^2.
```

Causa: una percentuale > 1 (es. 5.37 al posto di 0.0537) in una colonna
`NUMERIC(6,4)`.

Fix: aumentare precisione a `NUMERIC(12,6)` o normalizzare l'input
(dividere per 100).

### 10.2 `UnicodeEncodeError` su print

Il terminale Windows CP1252 non stampa alcuni caratteri. I script
forzano stdout a UTF-8:

```python
sys.stdout.reconfigure(encoding='utf-8')
```

In caso di errore, eseguire in PowerShell con `chcp 65001`.

### 10.3 Crosscheck segnala FAIL su cella che sembra OK

Cause tipiche:

1. Excel ha whitespace trailing (`"Attività Trasversali "` con spazio).
   Lo strip deve essere applicato sia in import che in check.
2. Confronto numerico con float: usare tolleranza (`abs(a-b) < 1e-4`).
3. Formato data diverso (datetime vs date). Normalizzare a ISO-8601
   string.

---

## 11. Reproducibility

Lo script `_inspect_all_sheets.py` dumpa su file di testo l'intero
contenuto dell'Excel (prime 60 righe per sheet). Utile per debug e per
dimostrare cosa era presente nell'Excel alla data dell'import.

```bash
python _inspect_all_sheets.py
# → _excel_full_dump.txt (~1 MB)
```

Questo file **non** viene committato nel repo (`.gitignore`), ma è utile
archiviarlo offline per audit.
