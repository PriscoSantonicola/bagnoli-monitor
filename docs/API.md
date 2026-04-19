# Bagnoli Monitor — API Reference

Base URL produzione: `https://monitoraggio.analist24.it.com`

Tutte le API sono servite dal processo Next.js (runtime `nodejs`).
`Content-Type: application/json` per le risposte JSON.
Le pagine HTML sono server-rendered.

Codici HTTP usati:
- `200 OK` — risposta con payload
- `303 See Other` — redirect dopo POST (login / logout)
- `307 Temporary Redirect` — redirect auth-gate (GET)
- `401 Unauthorized` — middleware non config.
- `404 Not Found` — slug inesistente
- `500 Internal Server Error` — eccezione non gestita

---

## 1. Pagine HTML

### 1.1 Homepage pubblica

```http
GET /
```

Dashboard pubblica con hero gauge, stato-grid, 3 macro-aree, budget-hero,
sezione gare, open data.

Parametri: nessuno.
Risposta: `text/html` (Next.js Server Component).
Auth: pubblica.

### 1.2 Pagina login

```http
GET /login?err=<0|1>&next=<path>
```

Form login custom (sostituisce modale Basic Auth). Auto-focus campo user.

Query:
| nome | tipo | descrizione |
|---|---|---|
| `err` | int? | Se `1`, mostra banner rosso "Utente o password errati" |
| `next` | path? | URL a cui tornare dopo login (default `/admin`) |

Risposta: `text/html`.
Auth: pubblica.

### 1.3 Admin — indice sheet

```http
GET /admin
```

Indice con stats sintetiche (cruscotto, crono, scadenze, milestone, gantt,
budget) e card per i 6 sheet.

Auth: richiede cookie sessione valido.
- Senza cookie: `307` → `/login?next=/admin`.

### 1.4 Admin — dettaglio sheet

```http
GET /admin/sheet/{slug}
```

| slug | vista |
|---|---|
| `cruscotto` | Dashboard replica Excel |
| `cronoprogramma` | Albero gerarchico task |
| `scadenze-go` | Scadenze in avvio |
| `scadenze-stop` | Scadenze in conclusione |
| `timeline-milestone` | SVG timeline milestone |
| `gantt` | Griglia calendario Gantt |

Slug diverso → `404`.
Auth: richiede cookie sessione valido.

---

## 2. API pubbliche JSON (`/api/public/*`)

Pensate per essere consumate da software terzi. CORS ad oggi consente same-
origin (nessun `Access-Control-Allow-Origin: *`); se serve allargare, va
configurato nell'`app/api/public/*/route.ts` o in nginx.

### 2.1 `GET /api/public/avanzamento`

Ritorna KPI globali, aggregato per macro-area (3 categorie coerenti col
foglio CUP) e orizzonte temporale.

**Parametri**: nessuno.

**Risposta 200**:

```json
{
  "kpi": {
    "totale": 22,
    "in_avanzamento": 19,
    "completati": 0,
    "non_iniziati": 3
  },
  "globale": {
    "pct_globale": 0.0485
  },
  "aree": [
    {
      "macro_area": "Attività Trasversali",
      "totale": 1,
      "completati": 0,
      "in_corso": 1,
      "da_avviare": 0,
      "pct_medio": 5.5,
      "n_cup": 1,
      "budget_eur": 50000000
    },
    {
      "macro_area": "Rigenerazione urbana",
      "totale": 13,
      "completati": 0,
      "in_corso": 10,
      "da_avviare": 3,
      "pct_medio": 3.9,
      "n_cup": 6,
      "budget_eur": 173705690
    },
    {
      "macro_area": "Risanamento ambientale",
      "totale": 8,
      "completati": 0,
      "in_corso": 8,
      "da_avviare": 0,
      "pct_medio": 6.4,
      "n_cup": 5,
      "budget_eur": 219494730
    }
  ],
  "orizzonte": {
    "data_inizio_min": "2021-10-07T00:00:00.000Z",
    "data_fine_max": "2030-06-30T00:00:00.000Z"
  },
  "aggiornato_al": "2026-04-19T10:36:51.401Z"
}
```

**Campi**:

| campo | tipo | descrizione |
|---|---|---|
| `kpi.totale` | int | Totale task Cruscotto (22) |
| `kpi.in_avanzamento` | int | Task con `0 < pct < 1` |
| `kpi.completati` | int | Task con `pct >= 1` |
| `kpi.non_iniziati` | int | Task con `pct = 0` o NULL |
| `globale.pct_globale` | float | Media aritmetica % avanzamento (range 0–1) |
| `aree[].macro_area` | string | Una di: `Risanamento ambientale`, `Rigenerazione urbana`, `Attività Trasversali` |
| `aree[].totale` | int | N. task nella macro-area |
| `aree[].completati` | int | N. task `pct ≥ 100` |
| `aree[].in_corso` | int | N. task `0 < pct < 100` |
| `aree[].da_avviare` | int | N. task `pct = 0` |
| `aree[].pct_medio` | float | Media aritmetica % avanzamento macro-area (range 0–100) |
| `aree[].n_cup` | int | N. CUP sotto la macro-area |
| `aree[].budget_eur` | float | Somma `importo_intervento_eur` (EUR) |
| `orizzonte.data_inizio_min` | ISO-8601 | Prima data di inizio tra tutti i task |
| `orizzonte.data_fine_max` | ISO-8601 | Ultima data fine tra tutti i task |
| `aggiornato_al` | ISO-8601 | Timestamp richiesta server |

**Algoritmo aggregazione**: vedi `docs/ALGORITHMS.md § 2`. La macro-area
`Infrastrutture` (WBS) viene rimappata su `Rigenerazione urbana` per
aderenza al foglio CUP dell'Excel sorgente.

---

### 2.2 `GET /api/public/finanze`

Totali finanziari aggregati per fonte e per macro-area + stato gare.

**Parametri**: nessuno.

**Risposta 200**:

```json
{
  "totali": {
    "tot_generale": 443200420,
    "tot_fsc": 352600000,
    "tot_comune": 30105690,
    "tot_dl148": 0,
    "tot_amianto": 10494730,
    "tot_altre": 50000000
  },
  "gare": {
    "totale": 34,
    "aggiudicate": 0,
    "in_corso": 34,
    "importo_totale": 32937126.72
  },
  "per_macro": [
    {
      "macro_area": "Attività Trasversali",
      "n_cup": 1,
      "importo_intervento": 50000000,
      "consuntivo": 37484230
    },
    {
      "macro_area": "Rigenerazione urbana",
      "n_cup": 6,
      "importo_intervento": 173705690,
      "consuntivo": 1950520
    },
    {
      "macro_area": "Risanamento ambientale",
      "n_cup": 5,
      "importo_intervento": 219494730,
      "consuntivo": 13330070
    }
  ],
  "aggiornato_al": "2026-04-19T10:36:51.401Z"
}
```

**Campi**:

| campo | tipo | descrizione |
|---|---|---|
| `totali.tot_generale` | float | Somma `importo_eur` di tutte le fonti_finanziamento |
| `totali.tot_fsc` | float | Somma filtrata `denominazione ILIKE '%FSC%'` |
| `totali.tot_comune` | float | Somma filtrata `denominazione ILIKE '%Comune%'` |
| `totali.tot_dl148` | float | Somma filtrata `denominazione ILIKE '%DL 148%'` |
| `totali.tot_amianto` | float | Somma filtrata `denominazione ILIKE '%Amianto%'` |
| `totali.tot_altre` | float | Somma filtrata `denominazione ILIKE '%DL 185%' OR '%Adp%'` |
| `gare.totale` | int | N. totale attività_gara |
| `gare.aggiudicate` | int | Gare con `stato ILIKE '%aggiudic%'` o `data_aggiudicazione` non null |
| `gare.in_corso` | int | Gare con `stato ILIKE '%pubblic%'` o `%corso%` |
| `gare.importo_totale` | float | Somma `importo_base_eur` di tutte le gare |
| `per_macro[].macro_area` | string | Categoria CUP |
| `per_macro[].n_cup` | int | N. CUP |
| `per_macro[].importo_intervento` | float | Somma `importo_intervento_eur` |
| `per_macro[].consuntivo` | float | Somma `importo_somme_disp_eur` al 31/12 |

---

### 2.3 `GET /api/cruscotto` (legacy)

Endpoint di compatibilità pre-refactor. Ritorna un oggetto aggregato
compatibile con chi aveva integrazioni sulla versione iniziale.

```json
{
  "cruscotto": [ /* lista task */ ],
  "totali": { "..." },
  "aggiornato_al": "..."
}
```

**Stato**: deprecato. Da migrare a `/api/public/avanzamento` +
`/api/public/finanze`.

---

## 3. API autenticazione (`/api/login`, `/api/logout`)

### 3.1 `POST /api/login`

Autentica un utente admin e, se valido, setta un cookie di sessione firmato.

**Request** (`application/x-www-form-urlencoded` o `multipart/form-data`):

| campo | tipo | obbligatorio | descrizione |
|---|---|:---:|---|
| `user` | string | ✅ | Username admin |
| `pass` | string | ✅ | Password admin |
| `remember` | `"on"` o omesso |  | Se presente e = `"on"`, cookie di 30 giorni; altrimenti session cookie (8 ore) |
| `next` | path |  | Path di redirect post-login (default `/admin`). Viene **validato**: deve iniziare con `/` e non con `//`; altrimenti ridotto a `/admin` |

**Risposta — successo**:
- `303 See Other`
- `Location: <forwarded-proto>://<forwarded-host><next>`
- `Set-Cookie: bagnoli_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<2592000|undefined>`

**Risposta — fallimento credenziali**:
- `303 See Other`
- `Location: <origin>/login?err=1&next=<next>`
- Nessun cookie settato.

**Risposta — misconfiguration**:
- `503 Service Unavailable` — `Admin non configurato` (se `ADMIN_PASS` o
  `SESSION_SECRET` non impostati).

**Formato token cookie** (`bagnoli_session`):

```
<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload, SESSION_SECRET))>
```

Payload JSON (mai cifrato, solo firmato — niente dati sensibili):

```json
{ "u": "admin", "exp": 1778998899733 }
```

dove `exp` è il timestamp di scadenza in millisecondi Unix.

**Esempio curl**:

```bash
curl -i -c cookies.txt -X POST \
  -d "user=admin&pass=CHANGE_ME&remember=on&next=/admin/sheet/cruscotto" \
  https://monitoraggio.analist24.it.com/api/login
# → 303 Location: /admin/sheet/cruscotto
# → Set-Cookie: bagnoli_session=eyJ1Ijoi...
```

---

### 3.2 `POST /api/logout` (anche `GET`)

Cancella il cookie di sessione.

**Request**: nessun payload richiesto.

**Risposta**:
- `303 See Other`
- `Location: <origin>/login`
- `Set-Cookie: bagnoli_session=; Path=/; Max-Age=0`

---

## 4. Middleware auth (`/admin/*`)

Il middleware Edge protegge tutti i path che iniziano con `/admin`. Logica:

```
1. Estrai cookie.get("bagnoli_session")?.value
2. verifyToken(token, SESSION_SECRET)
   - split su "."
   - ricalcola HMAC-SHA256 del body, confronta con la signature
   - decoding base64url del body → JSON → controlla exp > Date.now()
3. Se token valido E payload.u === process.env.ADMIN_USER (default "admin"):
      next()  // renderizza la pagina
   Altrimenti:
      redirect 307 → /login?next=<pathname>
```

Configurazione:

```typescript
export const config = { matcher: ["/admin/:path*"] };
```

---

## 5. Error handling

Le route handler JSON avvolgono l'execution in `try/catch` e ritornano:

```json
{
  "error": "db_error",
  "message": "<messaggio eccezione>"
}
```

con status `500`. Nelle pagine HTML eventuali eccezioni sono gestite dal
layout error di Next.js (`app/error.tsx` se presente, altrimenti la pagina
default).

---

## 6. Versioning

Le API **non hanno versioning esplicito** (no `/v1/`). Cambi breaking
saranno gestiti con:

1. Deprecazione annunciata nel `README` + header `Sunset`.
2. Rilascio parallelo del nuovo endpoint a un path diverso.
3. Rimozione vecchio endpoint dopo 90 giorni.

L'API legacy `/api/cruscotto` è già in stato "deprecato-compat".

---

## 7. Rate limiting

Nessun rate limiting applicato direttamente dall'app.
Misure in place:

- nginx aaPanel può essere configurato con `limit_req_zone` se servisse.
- Il pool `pg` è limitato a `max: 10` connessioni (vedi `src/lib/db.ts`).

---

## 8. Esempi di integrazione

### 8.1 Widget esterno con fetch + aggregato macro-aree

```html
<div id="bagnoli-avanzamento"></div>
<script>
fetch("https://monitoraggio.analist24.it.com/api/public/avanzamento")
  .then(r => r.json())
  .then(({ aree, globale, kpi }) => {
    document.getElementById("bagnoli-avanzamento").innerHTML = `
      <h3>Avanzamento Bagnoli: ${(globale.pct_globale * 100).toFixed(1)} %</h3>
      <ul>
        ${aree.map(a => `
          <li>${a.macro_area}: ${a.pct_medio}% — €${(a.budget_eur/1e6).toFixed(1)} M</li>
        `).join("")}
      </ul>
      <p>Totale: ${kpi.totale} (${kpi.in_avanzamento} in corso, ${kpi.completati} completati)</p>
    `;
  });
</script>
```

### 8.2 Python requests

```python
import requests
r = requests.get("https://monitoraggio.analist24.it.com/api/public/finanze")
data = r.json()
print(f"Budget totale: € {data['totali']['tot_generale']:,.0f}")
print(f"FSC: € {data['totali']['tot_fsc']:,.0f}")
print(f"Gare totali: {data['gare']['totale']}")
```
