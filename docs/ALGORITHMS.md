# Bagnoli Monitor — Algoritmi e regole di calcolo

Questo documento raccoglie le **regole di business** e gli **algoritmi non
banali** implementati nel codice. Obiettivo: chiunque debba reimplementare
o evolvere il software può partire da qui senza ricavare la logica dai
singoli file.

---

## 1. KPI globali (`GET /api/public/avanzamento` — campo `kpi`)

Fonte dati: tabella `task` della `versione_id = 1`.

Definizioni:

| KPI | Regola |
|---|---|
| `totale` | `COUNT(*) FROM task WHERE versione_id = 1` |
| `in_avanzamento` | `COUNT(*) WHERE 0 < pct < 100` |
| `completati` | `COUNT(*) WHERE pct >= 100` |
| `non_iniziati` | `COUNT(*) WHERE pct IS NULL OR pct = 0` |

**Nota**: la colonna `percentuale_avanzamento` è memorizzata in modo diverso
tra tabelle (`task.percentuale_avanzamento` è 0–100; `cruscotto_task.pct_avanzamento`
è 0–1). Il codice frontend moltiplica/divide per 100 dove serve.

Implementazione (`src/app/api/public/avanzamento/route.ts`):

```sql
SELECT
  COUNT(*)::int                                                          AS totale,
  COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) > 0
                   AND percentuale_avanzamento < 100)::int               AS in_avanzamento,
  COUNT(*) FILTER (WHERE percentuale_avanzamento >= 100)::int            AS completati,
  COUNT(*) FILTER (WHERE COALESCE(percentuale_avanzamento,0) = 0)::int   AS non_iniziati
FROM task WHERE versione_id = 1;
```

---

## 2. Aggregazione per macro-area con remap Infrastrutture → Rigenerazione urbana

**Problema originario**: il WBS (tabella `wbs`) ha 4 macro-aree
(Risanamento, Rigenerazione, Infrastrutture, Trasversali), ma il foglio
CUP dell'Excel (fonte autoritativa per il pubblico) ne ha solo 3 —
Infrastrutture non ha CUP finanziari propri, le sue attività (Energia,
Trasporti, Idriche) sono sotto "Rigenerazione urbana".

**Regola applicata** lato `GET /api/public/avanzamento` e Homepage:

```
Se task.wbs.nome == "Infrastrutture"
   → macro_area = "Rigenerazione urbana"
Altrimenti
   → macro_area = task.wbs.nome
```

**Query effettiva**:

```sql
WITH task_mapped AS (
  SELECT
    t.id,
    t.percentuale_avanzamento,
    CASE WHEN w.nome = 'Infrastrutture' THEN 'Rigenerazione urbana'
         ELSE w.nome END AS macro_area
  FROM task t
  LEFT JOIN wbs w ON w.id = t.wbs_id
  WHERE t.versione_id = 1
),
cup_agg AS (
  SELECT c.macro_area,
         COUNT(*)::int                                      AS n_cup,
         COALESCE(SUM(s.importo_intervento_eur),0)::float  AS budget_eur
  FROM cup c
  LEFT JOIN sintesi_intervento s ON s.cup_id = c.id AND s.versione_id = 1
  GROUP BY c.macro_area
)
SELECT tm.macro_area,
       COUNT(tm.id)::int AS totale,
       COUNT(*) FILTER (WHERE tm.percentuale_avanzamento >= 100)::int AS completati,
       COUNT(*) FILTER (WHERE 0 < tm.percentuale_avanzamento
                              AND tm.percentuale_avanzamento < 100)::int AS in_corso,
       COUNT(*) FILTER (WHERE COALESCE(tm.percentuale_avanzamento,0) = 0)::int AS da_avviare,
       ROUND(AVG(COALESCE(tm.percentuale_avanzamento,0))::numeric, 1)::float AS pct_medio,
       COALESCE(ca.n_cup, 0)       AS n_cup,
       COALESCE(ca.budget_eur, 0)  AS budget_eur
FROM task_mapped tm
LEFT JOIN cup_agg ca ON ca.macro_area = tm.macro_area
GROUP BY tm.macro_area, ca.n_cup, ca.budget_eur
ORDER BY CASE tm.macro_area
           WHEN 'Risanamento ambientale' THEN 1
           WHEN 'Rigenerazione urbana'   THEN 2
           WHEN 'Attività Trasversali'   THEN 3
           ELSE 4
         END;
```

Risultato atteso (3 righe):

```
Risanamento ambientale | totale=8  | pct_medio=6.4 | n_cup=5 | budget=219.494.730
Rigenerazione urbana   | totale=13 | pct_medio=3.9 | n_cup=6 | budget=173.705.690
Attività Trasversali   | totale=1  | pct_medio=5.5 | n_cup=1 | budget=50.000.000
```

Somma budget = € 443.200.420 (coincide con il totale complessivo R20 del
foglio CUP Excel: € 443.200,42 k).

---

## 3. "% Giorni completati" del donut Cruscotto

**Formula**:

```
pctGiorni = (oggi - dataInizioPeriodo) / (dataFinePeriodo - dataInizioPeriodo) × 100
```

dove:
- `dataInizioPeriodo = 2021-10-07`
- `dataFinePeriodo   = 2030-06-30`

Non è ponderato col `pct_avanzamento` dei singoli task — riproduce
l'indicatore Excel che mostra semplicemente **quanta parte temporale del
programma è trascorsa**.

Implementazione (`src/app/admin/sheet/cruscotto/page.tsx`):

```typescript
const PERIODO_INIZIO = new Date("2021-10-07");
const PERIODO_FINE   = new Date("2030-06-30");

function calcPctGiorni(now = new Date()): number {
  const totDays  = (PERIODO_FINE.getTime()   - PERIODO_INIZIO.getTime()) / 86_400_000;
  const elapsed  = (now.getTime()            - PERIODO_INIZIO.getTime()) / 86_400_000;
  return Math.min(100, Math.max(0, (elapsed / totDays) * 100));
}
```

Valori di verifica:
- 17/04/2026 → **51,86 %** (Excel mostra 51,85 %, differenza 0,01 % dovuta
  a `OGGI` dell'Excel fissato al 20/03/2026 hardcoded)
- 30/06/2030 → 100 %
- prima del 07/10/2021 → 0 %

---

## 4. Compressione Gantt (RLE su celle "X")

### 4.1 Problema

Lo sheet Excel `Gantt` è 237 × 3308. Ogni task è una riga, ogni colonna è
un giorno dal 07/10/2021 al 30/06/2030. Una cella vale `"X"` se il task è
attivo quel giorno, vuota altrimenti.

Importare 1:1 genererebbe ~780.000 righe `(task_id, col_idx, x_bool)` quasi
tutte vuote.

### 4.2 Algoritmo

```
PER ogni riga task:
    1. Leggi categoria: obiettivo_generale (C0), obiettivi_specifici (C1),
       azioni (C2), sub_ambito (C3), fase (C4)
    2. Scandisci le colonne da 5 a 3308:
         SE cella == "X":
             accumula col_idx in x_cols[]
    3. Ordina x_cols e raggruppa run contigui:
         start = prev = x_cols[0]
         PER c in x_cols[1:]:
             SE c == prev + 1:
                 prev = c
             ALTRIMENTI:
                 emit range(start, prev)
                 start = prev = c
         emit range(start, prev)
    4. Converti ogni (start_col, end_col) in (start_date, end_date) via
       lookup nella tabella header R3 (giorno per colonna)
    5. Salva in gantt_row.ranges come JSONB array:
         [{"start":"2022-01-03","end":"2023-02-27"}, ...]
```

### 4.3 Rendering

In `src/app/admin/sheet/gantt/page.tsx` la barra di ogni range viene
posizionata con CSS percentuali lineari:

```
left  = (range.start - HORIZON_START) / HORIZON_DAYS × 100  %
width = (range.end   - range.start)   / HORIZON_DAYS × 100  %
```

dove `HORIZON_DAYS = (2030-06-30) - (2021-10-07) = 3188` giorni.

### 4.4 Statistiche dataset attuale

- 233 task rows importati (vs 237 righe Excel — 4 righe sono di separazione
  senza dato).
- 228 task con ≥ 1 range (5 task completamente vuoti).
- ~2800 range totali (media ~12 range/task).
- Riduzione dimensionale: ~95 % rispetto a una tabella flat.

---

## 5. Timeline MILESTONE — coordinate SVG

### 5.1 Dataset

Tabella `milestone_point` con colonne:

- `data_milestone` (DATE)
- `posizione` (INT) — valore dall'Excel, range [-150, +130]
- `etichetta` (TEXT) — "Risanamento Parco Urbano", ecc.

Regola Excel:
- `posizione > 0` → milestone sopra la timeline centrale (cerchio verde = Risanamento)
- `posizione < 0` → milestone sotto la timeline centrale (quadrato blu = Realizzazione)

### 5.2 Algoritmo SVG

Orizzonte timeline:
```
T_START = 2021-09-01
T_END   = 2027-12-31
T_MS    = T_END - T_START   // millisecondi totali
```

Per ciascun milestone:
```
x   = (data_milestone - T_START) / T_MS × SVG_WIDTH
y   = SVG_HEIGHT / 2 ± (|posizione| / maxPosizione) × 240
```

Il ± dipende dal segno di `posizione`.

Il marker "OGGI" è ricalcolato live:
```
x_today = (Date.now() - T_START) / T_MS × SVG_WIDTH
```

Con tratteggio rosso verticale lungo tutta l'altezza del chart.

---

## 6. Mini-Gantt nel Cruscotto task table

Ogni riga task ha una "barra Gantt" proporzionale su base orizzonte
2021-10-07 → 2030-06-30.

**Larghezza e offset**:
```typescript
const HORIZON_START = new Date("2021-10-07");
const HORIZON_END   = new Date("2030-06-30");
const HORIZON_DAYS  = (HORIZON_END - HORIZON_START) / 86_400_000;

function barStyle(task) {
  const d0 = new Date(task.inizio).getTime();
  const d1 = new Date(task.fine).getTime();
  const left  = Math.max(0, ((d0 - HORIZON_START) / 86_400_000) / HORIZON_DAYS * 100);
  const width = Math.max(0.3, ((d1 - d0) / 86_400_000) / HORIZON_DAYS * 100);
  return { left: `${left}%`, width: `${width}%` };
}
```

**Fill di completamento interno**:

La barra è renderizzata come due strati sovrapposti:
1. Sfondo `#e2e8f0` (barra totale del task).
2. Wrapper colorato macro-area con opacity 20% + border.
3. Fill sopra: colore pieno macro-area, `width: pct_avanzamento %`.

Colori per macro-area:
```typescript
function colorForMacro(m: string): string {
  if (m.includes("Risanamento"))           return "#16a34a"; // verde
  if (m.includes("Rigenerazione"))         return "#2563eb"; // blu
  if (m.includes("Infrastru"))             return "#f59e0b"; // arancio
  if (m.includes("Trasv") || "Altro")      return "#7c3aed"; // viola
  return "#64748b";                                          // default
}
```

---

## 7. Signing / verify del token sessione (HMAC SHA-256)

### 7.1 Struttura

Token = `base64url(JSON_payload).base64url(HMAC_SHA256(payload, secret))`

Payload:
```json
{ "u": "admin", "exp": 1778998899733 }
```

dove `exp` è timestamp millisecondi Unix.

### 7.2 Sign

```typescript
async function signToken(payload, secret, maxAgeMs) {
  const data = { ...payload, exp: Date.now() + maxAgeMs };
  const body = b64urlEncode(enc.encode(JSON.stringify(data)));
  const key  = await crypto.subtle.importKey("raw", enc.encode(secret),
                                              { name:"HMAC", hash:"SHA-256" },
                                              false, ["sign","verify"]);
  const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}
```

### 7.3 Verify

```typescript
async function verifyToken(token, secret) {
  const [body, sig] = token.split(".");
  const key = await getKey(secret);
  const ok  = await crypto.subtle.verify("HMAC", key,
                                          b64urlDecode(sig),
                                          enc.encode(body));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  if (data.exp < Date.now()) return null;
  return data;
}
```

**Implementazione base64url**: custom perché Edge runtime non ha `Buffer`.
Si appoggia a `btoa`/`atob` con sostituzione `+` → `-`, `/` → `_`, padding `=` rimosso.

### 7.4 Perché HMAC SHA-256 e non JWT

- Payload contiene zero informazioni sensibili (solo `u` e `exp`).
- Non serve verifica asimmetrica (solo il nostro server firma e verifica).
- Zero dipendenze esterne (la libreria JWT più piccola è ~8 kB, HMAC via
  Web Crypto è nativo).
- La struttura è di fatto un "JWT minimale" — se in futuro servisse
  interop, basterebbe aggiungere `alg`/`typ` nell'header per diventare
  standard-compliant.

### 7.5 Sicurezza

- `SESSION_SECRET` = 32 byte random (generato con `crypto.randomBytes(32)`).
- Secret deve essere **identico** tra builder (firma in route handler) e
  middleware Edge (verify). Entrambi lo leggono da `process.env.SESSION_SECRET`.
- Costante tempo: `crypto.subtle.verify` è implementata in modo
  costante-tempo nelle engine moderne (V8, SpiderMonkey).
- Durata: 30 giorni ricorda / 8 ore sessione. Nessun meccanismo di refresh
  (il cookie va rinnovato con un nuovo login).

---

## 8. Validazione del parametro `next` dopo login

Per evitare **open redirect** il server valida `next` ricevuto dal form
prima di farci la redirect.

Regole:

```typescript
function safeNext(n: string | null): string {
  if (!n)                       return "/admin";
  if (!n.startsWith("/"))       return "/admin";   // esterno → no
  if (n.startsWith("//"))       return "/admin";   // protocol-relative → no
  return n;
}
```

Se `next = "https://evil.com/steal"` → viene ignorato.
Se `next = "//evil.com/steal"`   → viene ignorato.
Se `next = "/admin/sheet/gantt"` → OK.

---

## 9. Reconstruction forwarded host (middleware + API)

Dietro nginx reverse proxy, `req.url` conterrebbe `http://127.0.0.1:3000`
(host interno). Per le redirect servono il proto/host pubblici.

Priorità:
```typescript
const fh = req.headers.get("x-forwarded-host") ||
           req.headers.get("host") ||
           req.nextUrl.host;

const fp = req.headers.get("x-forwarded-proto") ||
           req.nextUrl.protocol.replace(":", "");
```

nginx deve quindi forwardare questi header (vedi `docs/DEPLOYMENT.md`).

---

## 10. Formato numerico italiano

Tutte le visualizzazioni usano locale `it-IT`:

| Funzione | Esempio |
|---|---|
| `formatEuro(443200420, 0)` | `€ 443.200.420` |
| `formatMeur(443200420)` | `€ 443,2 M` (sempre 1 decimale) |
| `formatPct(0.0485, 2)` | `4,85%` |
| `formatInt(22)` | `22` |
| `formatDate("2022-01-03")` | `3 gennaio 2022` |
| `formatDateShort("2022-01-03")` | `03/01/2022` |

Implementazione in `src/lib/format.ts`, usa `Intl.NumberFormat` /
`Intl.DateTimeFormat` nativo.

---

## 11. Ricostruzione mesi calendario (header Gantt + mini-Gantt)

Per generare l'header "Gen-22 | Feb-22 | ..." con il mese iniziale di
ciascun anno in grassetto blu:

```typescript
const MONTHS = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const cur = new Date(HORIZON_START);
while (cur <= HORIZON_END) {
  months.push({
    label: `${MONTHS[cur.getMonth()]}-${String(cur.getFullYear()).slice(2)}`,
    pct:   ((cur.getTime() - HORIZON_START.getTime()) / 86_400_000) / HORIZON_DAYS * 100,
    isYear: cur.getMonth() === 0,
  });
  cur.setMonth(cur.getMonth() + 1);
}
```

Il label viene poi posizionato in `%` orizzontale con `position: absolute;
left: ${pct}%;`.

---

## 12. Query distinct per slicer

Il Cruscotto popola i chip dei filtri con valori distinti presi **dalla
tabella `crono_task`** (325 righe, più completa del Cruscotto sheet a 22
task).

Lista filtri + colonne:

| Slicer | Colonna |
|---|---|
| Ambito | `sub_ambito` |
| Obiettivo Generale | `obiettivo_generale` |
| Obiettivi Specifici | `obiettivi_specifici` |
| Azioni | `azioni` |
| Superficie | `superficie` |
| Area Tematica | `area_tematica` |
| Unità d'Intervento | `unita_intervento` |
| Tipologia | `tipologia` (A-Proc, B-Sub, C-Fase, D-Sub Fase, E-Step, F-Step 1, Processo) |
| Attività | `attivita` (Avviata, CONCLUSA, Non avviata) |
| Stato Proc.Amm-vo | `stato_proc_amm` |
| CONTRATTO | `contratto` |
| Oggetto | `oggetto` |
| Livello | `livello_proc` |
| Sub Livello | `sub_livello_proc` |

Query (parametrizzata sul nome colonna):

```sql
SELECT DISTINCT {col} FROM crono_task WHERE {col} IS NOT NULL ORDER BY {col};
```

Tutte eseguite in parallelo via `Promise.all(...)` durante il render.

---

## 13. Cross-check Excel → DB (quality gate)

Lo script `_crosscheck_excel_db.py` (fuori dal container) esegue un
confronto valore-per-valore tra file Excel sorgente e righe DB Hetzner,
per tutte le tabelle admin.

Copertura cross-check attuale:

- 22 × 7 colonne in `cruscotto_task`
- 12 × 2 colonne in `scadenza` (GO)
- 12 × 2 colonne in `scadenza` (STOP)
- 18 × 4 colonne in `milestone_point`
- 227 × 4 colonne in `gantt_row`

**Totale**: 1182 check → 0 fail atteso. Se un import introduce una
discrepanza, lo script la evidenzia con `FAIL <sheet> <row> <field>:
Excel=X  DB=Y`.

Da eseguire:

```bash
python _crosscheck_excel_db.py
```

---

## 14. Formula Health Check container

Il healthcheck docker esegue:

```bash
wget --spider -q http://127.0.0.1:3000/api/public/avanzamento || exit 1
```

ogni 30 secondi dopo 20 s di start_period, massimo 5 retry.

Motivazione: `/api/public/avanzamento` tocca effettivamente il pool `pg`
+ esegue 4 query, quindi un 200 OK prova che:
- Node process risponde
- pool Postgres è connesso
- `search_path` è impostato
- le query base non rompono

Più robusto di un semplice check su `GET /` (che in caso di DB down
ritornerebbe comunque 500 senza farlo notare).
