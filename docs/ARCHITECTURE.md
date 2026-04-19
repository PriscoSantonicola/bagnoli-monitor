# Bagnoli Monitor — Architettura tecnica

Questo documento descrive l'architettura del software **Bagnoli Monitor**,
pubblicato su <https://monitoraggio.analist24.it.com>.

---

## 1. Panoramica

Bagnoli Monitor è una **Single Page Server-rendered application** (Next.js 14,
App Router) che espone:

- un **frontend pubblico** (`/`) con dashboard di trasparenza sul Programma di
  Rigenerazione Bagnoli-Coroglio (macro-aree, KPI avanzamento, budget,
  gare pubblicate);
- un'**area riservata** (`/admin/*`) che replica 1:1 lo sheet Excel di
  coordinamento del Commissariato (Cruscotto, CronoProgramma, Scadenze GO/STOP,
  Timeline MILESTONE, Gantt);
- un insieme di **API JSON pubbliche** (`/api/public/*`) consumabili da altri
  software.

È **read-only**: non scrive sul DB dalla UI. Le operazioni di import dati
(Excel → Postgres) sono eseguite offline tramite script Python dedicati
(vedi `docs/IMPORT-DATA.md`).

---

## 2. Stack tecnologico

| Livello | Tecnologia | Motivazione |
|---|---|---|
| Runtime | Node.js 20 LTS (Alpine) | Next.js 14 standalone |
| Framework | Next.js 14 App Router | Server components + route handler + middleware Edge |
| Linguaggio | TypeScript 5.x (strict) | Tipizzazione completa, controllo compile-time |
| DB Client | `pg` 8.13 (node-postgres) | Pool connessioni, no ORM (scelta minimale dopo abbandono di Prisma) |
| Auth | HMAC SHA-256 via Web Crypto | Token firmato tipo JWT minimale (no dipendenze esterne) |
| Packaging | Docker multistage + docker compose | Stack autoconsistente, 1 comando per partire |
| Reverse Proxy | nginx (aaPanel) | SSL termination Let's Encrypt, forward a 127.0.0.1:3000 |
| Database | PostgreSQL 16 (Hetzner managed) | Schema `bagnoli_cantieri` fornito e manutenuto dall'admin DB |
| CDN Font | Font Awesome 6.5 + Inter | Caricati via CDN nel `<head>` |

Stack **esplicitamente esclusi**: ORM (Prisma scartato per overhead build),
Redis, message queue, worker async, cron interne, server-side session store
(no stato mutabile sul server tranne il pool `pg`).

---

## 3. Topologia di deployment

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                          Internet (HTTPS)                           │
 └──────────────────────────┬──────────────────────────────────────────┘
                            │ 443/tcp TLS 1.2/1.3
                            ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Nginx (aaPanel, server sup-dep.ddns.net:223)                        │
 │ - monitoraggio.analist24.it.com                                     │
 │ - cert Let's Encrypt, rinnovo cron 03:00                            │
 │ - HSTS, HTTP/2                                                      │
 └──────────────────────────┬──────────────────────────────────────────┘
                            │ reverse_proxy → 127.0.0.1:3000
                            │ X-Forwarded-{Host,Proto,For}
                            ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Docker Compose stack "bagnoli-monitor"                              │
 │ ┌─────────────────────────────────────────────────────────────────┐ │
 │ │ service "app"  (container bagnoli-monitor)                      │ │
 │ │  - Node 20 Alpine                                               │ │
 │ │  - Next.js 14 standalone (server.js)                            │ │
 │ │  - User non-root (uid 1001)                                     │ │
 │ │  - Healthcheck wget /api/public/avanzamento ogni 30s            │ │
 │ │  - Logging: json-file, 10 MB x 3 file                           │ │
 │ │  - restart: unless-stopped                                      │ │
 │ │  - bind: 127.0.0.1:3000 (no esposizione diretta al mondo)       │ │
 │ │  - env-file: .env                                               │ │
 │ │  - network: bagnoli-net (bridge)                                │ │
 │ └─────────────────────────────────────────────────────────────────┘ │
 │ ┌─────────────────────────────────────────────────────────────────┐ │
 │ │ service "db-dev"  (profilo dev, opzionale)                      │ │
 │ │  - Postgres 16 Alpine, schema preinstallato da init script      │ │
 │ │  - bind: 127.0.0.1:5434                                         │ │
 │ │  - NON attivo in produzione                                     │ │
 │ └─────────────────────────────────────────────────────────────────┘ │
 └──────────────────────────┬──────────────────────────────────────────┘
                            │ Postgres wire protocol, TLS upstream
                            ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ PostgreSQL 16 (Hetzner managed - esterno al nostro stack)           │
 │ - hetzner-dbserver-dev.sviluppo-sw.it:5432                          │
 │ - database: devbagnolicrm                                           │
 │ - schema: bagnoli_cantieri (letture + metadata Excel import)        │
 │ - schema sibling: bagnoli_ambiente (gestito da altro team FastAPI)  │
 └─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Network boundaries

- Il container **non è esposto pubblicamente**: il bind è `127.0.0.1:3000`,
  raggiungibile solo da processi sullo stesso host (ovvero nginx aaPanel).
- Il container **esce verso Internet** solo per raggiungere il Postgres
  Hetzner (porta 5432, firewall del DB configurato in allowlist sull'IP
  pubblico del server aaPanel).
- Nessun ingresso sulla rete `bagnoli-net` viene esposto (serve solo a
  isolare la comunicazione app↔db-dev quando è attivo il profilo dev).

### 3.2 Forwarding headers

Il middleware Next.js ricostruisce l'host corretto dalle seguenti intestazioni
(configurazione nginx sottostante obbligatoria):

- `X-Forwarded-Host`
- `X-Forwarded-Proto`
- `X-Forwarded-For`

Senza questi header le `NextResponse.redirect(...)` torniano erroneamente
a `http://127.0.0.1:3000` (host interno). La config di esempio è in
`docs/DEPLOYMENT.md`.

---

## 4. Struttura del repository

```
.
├── Dockerfile                  # build multistage Node 20 Alpine, output standalone
├── docker-compose.yml          # service "app" + "db-dev" (profilo dev)
├── docker-run.sh               # wrapper compose up + cleanup legacy
├── .dockerignore               # esclude .env, helpers Python, node_modules
├── .env.example                # template variabili ambiente
├── next.config.mjs             # `output: 'standalone'`, esperienza production
├── package.json                # dipendenze: next, react, pg (solo)
├── schema_cantieri.sql         # schema DDL iniziale
├── _*.py                       # helper Python (import Excel, deploy SSH, crosscheck)
├── docs/                       # QUESTO PACCHETTO
└── src/
    ├── middleware.ts           # Edge: protezione /admin/* con cookie sessione
    ├── lib/
    │   ├── db.ts               # pg Pool singleton (search_path)
    │   ├── format.ts           # formatter IT (Euro, date, %)
    │   └── session.ts          # HMAC SHA-256 sign/verify via Web Crypto
    ├── components/
    │   ├── AdminSheetLayout.tsx  # shell navigation con tabs Excel-like
    │   ├── ScadenzeView.tsx      # componente condiviso GO/STOP
    │   ├── HeroClient.tsx        # gauge animato + counter (client)
    │   └── ProgressClient.tsx    # barra progress animata (client)
    └── app/
        ├── layout.tsx          # root: Inter + Font Awesome CDN
        ├── globals.css         # design system + classi responsive
        ├── page.tsx            # Homepage trasparenza (server)
        ├── login/page.tsx      # Form login
        ├── api/
        │   ├── login/route.ts     # POST: setta cookie firmato
        │   ├── logout/route.ts    # POST/GET: cancella cookie
        │   ├── public/
        │   │   ├── avanzamento/route.ts   # GET: aggregato KPI
        │   │   └── finanze/route.ts       # GET: aggregato finanziario
        │   └── cruscotto/route.ts         # GET: legacy (compat)
        └── admin/
            ├── page.tsx            # Indice 6 sheet + stats
            └── sheet/
                ├── cruscotto/page.tsx              # Dashboard replica Excel
                ├── cronoprogramma/page.tsx         # Tree gerarchico 325 righe
                ├── scadenze-go/page.tsx            # usa ScadenzeView
                ├── scadenze-stop/page.tsx          # usa ScadenzeView
                ├── timeline-milestone/page.tsx     # SVG timeline
                └── gantt/page.tsx                  # griglia calendario
```

---

## 5. Runtime Next.js — runtime per route

Ogni `page.tsx` / `route.ts` dichiara esplicitamente il runtime:

- **`runtime = "nodejs"`** per tutte le pagine e API che leggono dal DB
  (richiede `pg`, non disponibile in Edge).
- **Middleware** (`src/middleware.ts`) gira su **Edge runtime** per default,
  usa **Web Crypto API** (`crypto.subtle`) per verificare il token del cookie.

`dynamic = "force-dynamic"` è impostato ovunque: disabilita la ISR / static
generation, garantisce che ogni richiesta esegua le query DB live. Il trade-off
è un costo extra di ~50 ms per request, ma il volume è basso (≤ 1 req/s in
media) e i dati cambiano a ogni import Excel, quindi la cache statica sarebbe
dannosa.

---

## 6. Data flow

### 6.1 Lettura pubblica (`GET /`)

```
Browser ─▶ nginx ─▶ Next.js page.tsx (server component)
                        │
                        ▼
                    await q(`
                      SELECT COUNT(*), AVG(...)
                      FROM bagnoli_cantieri.task
                      ...
                    `)
                        │
                        ▼
                    pg Pool (5 connections, search_path pre-set)
                        │
                        ▼
                    Postgres Hetzner
                        │
                        ▼
                    render HTML + CSS → browser
```

### 6.2 Consumo API (`GET /api/public/avanzamento`)

```
Client (qualsiasi) ─▶ nginx ─▶ Next.js route handler
                                   │
                                   ▼
                              3 query parallele (Promise.all):
                                 - KPI totali
                                 - % globale
                                 - aggregato 3 macro-aree
                                 - orizzonte (MIN/MAX date)
                                   │
                                   ▼
                              NextResponse.json({kpi, globale, aree, ...})
                                   │
                                   ▼
                              Content-Type: application/json
```

### 6.3 Autenticazione admin (`POST /api/login` → `GET /admin/sheet/*`)

```
Browser
  │ POST /api/login (form: user,pass,remember,next)
  ▼
Route handler (nodejs runtime)
  │
  ├─ valida user/pass vs process.env.ADMIN_USER/ADMIN_PASS
  │
  ├─ se OK:
  │    sessione = signToken({u:user}, SESSION_SECRET, maxAgeMs)
  │    Set-Cookie: bagnoli_session=<token>; HttpOnly; Secure; SameSite=Lax; Max-Age=...
  │    Location: /<next>
  │    Status: 303
  │
  └─ se KO:
       Location: /login?err=1&next=<next>
       Status: 303
```

Successive richieste `/admin/*`:

```
Browser (cookie bagnoli_session)
  │ GET /admin/sheet/cruscotto
  ▼
Middleware Edge
  │
  ├─ cookie.get("bagnoli_session")?.value
  ├─ verifyToken(token, SESSION_SECRET)
  │    split body.sig
  │    HMAC SHA-256 verify (Web Crypto)
  │    check exp > Date.now()
  │
  ├─ session valida + session.u === ADMIN_USER:
  │    NextResponse.next()  → passa al render
  │
  └─ altrimenti:
       303 → /login?next=/admin/sheet/cruscotto
```

---

## 7. Ambienti e configurazione

### 7.1 Variabili d'ambiente

| Chiave | Tipo | Obbligatoria | Descrizione |
|---|---|:---:|---|
| `DATABASE_URL` | URI | ✅ | Connection string Postgres |
| `NEXT_PUBLIC_SITE_URL` | URL | ✅ | Origin pubblico (SEO + metadata) |
| `PORT` | int | ✅ | Porta del server Next.js (default 3000) |
| `NODE_ENV` | enum | ✅ | `production` / `development` |
| `ADMIN_USER` | string |   | Default `admin` |
| `ADMIN_PASS` | string | ✅ | Password admin in chiaro (env, no DB) |
| `SESSION_SECRET` | hex(64) | ✅ | Chiave HMAC cookie — generare con `crypto.randomBytes(32).toString("hex")` |
| `DB_DEV_PASSWORD` | string |   | Solo con `docker compose --profile dev` |

### 7.2 Ambienti

- **Produzione**: `sup-dep.ddns.net:223` → domain
  `monitoraggio.analist24.it.com`, DB Hetzner reale.
- **Staging / Dev locale**: stesso stack, o con `--profile dev` per Postgres
  containerizzato.

### 7.3 Build & deployment

Deploy automatizzato via script Python che esegue in sequenza:

1. Aggiorna `.env` sul server via SFTP.
2. `git fetch --all && git reset --hard origin/main` nel working dir.
3. Rileva compose v1/v2.
4. `docker compose build --no-cache app`.
5. Stop eventuale container legacy ("docker run" vecchio).
6. `docker compose up -d --force-recreate app`.
7. Autotune: health check + curl sui principali endpoint + controllo auth
   end-to-end.

Vedi `docs/DEPLOYMENT.md` per la procedura completa manuale e per il
disaster recovery.

---

## 8. Scelte architetturali notevoli

### 8.1 Perché nessun ORM

Partiti con Prisma, abbandonato dopo il primo sprint:

- Aggiungeva ~80 MB al container (binari per 4 piattaforme).
- `prisma generate` in fase di build introduceva uno step fragile + `openssl`
  alpine (rotto con musl in certe versioni).
- La lettura è interamente agregata (`SELECT ... GROUP BY`), il beneficio
  dell'ORM era marginale.
- `pg` + template literal è sufficiente e più trasparente per il team di
  manutenzione.

### 8.2 Perché Basic Auth → Cookie HMAC

Il dialogo modale nativo `WWW-Authenticate: Basic` è invasivo su mobile e
inaccessibile da iframe embed. Sostituito con una login page UI-consistent
e un cookie firmato senza storage lato server — scelta **stateless**: ogni
request valida il token localmente, nessuna tabella `sessions` da mantenere.

### 8.3 Perché docker compose e non k8s

Scala di traffico stimata: ≤ 1 req/s, 22 task + 325 righe crono.
Kubernetes sarebbe overkill di un ordine di grandezza. docker compose copre
restart, health check, log rotation, networking — quanto basta.

### 8.4 Perché 3 macro-aree in frontend pubblico vs 4 in DB

Il WBS (Work Breakdown Structure) dell'Excel ha 4 macro-aree:
`Risanamento ambientale`, `Rigenerazione urbana`, `Infrastrutture`,
`Attività Trasversali`. Ma il foglio CUP (parte finanziaria) ne ha solo 3:
Infrastrutture non ha CUP finanziari propri — le sue attività (Energia,
Trasporti, Idriche) sono CUP classificati sotto "Rigenerazione urbana".

Per coerenza con la lettura del Commissariato, il frontend pubblico applica
un **remap `Infrastrutture → Rigenerazione urbana`** in fase di aggregazione
(dettaglio in `docs/ALGORITHMS.md`).

### 8.5 Compressione Gantt

Lo sheet Gantt dell'Excel è 237 righe × 3308 colonne (una cella giornaliera
per ogni task per ogni giorno dell'orizzonte 2021-10 → 2030-06). Trasferirlo
in DB 1:1 sarebbe ~780k righe quasi tutte vuote.

Abbiamo implementato una **compressione RLE** (run-length encoding) che
detecta run contigui di celle "X" e li salva come array di `{start, end}` in
un campo `JSONB`. Riduce ~95 % la cardinalità mantenendo fedeltà totale.

---

## 9. Osservabilità

- **Log applicazione**: stdout del container, rotati da Docker daemon
  (json-file driver, 10 MB × 3 file).
  ```bash
  docker compose logs -f app
  ```
- **Health**: `docker inspect --format '{{.State.Health.Status}}'`
  (healthy / unhealthy / starting).
- **Metriche DB**: lato Postgres (`pg_stat_activity`, `pg_stat_statements`
  se abilitato).
- **Metriche nginx**: log aaPanel.

Non c'è ancora APM (Sentry, DataDog, etc.). Se il volume cresce:
- aggiungere Sentry per error tracking (una riga in `layout.tsx`);
- aggiungere un `/api/metrics` endpoint con counter Prometheus.

---

## 10. Evoluzione prevista

Possibili estensioni già supportate dall'architettura corrente:

1. **Aggiornamento dati in tempo reale** — attualmente i dati vengono importati
   da Excel offline. Evoluzione: Webhook / API upstream → tabella staging →
   re-materializzazione dei campi calcolati.
2. **Integrazione con il backend centraline** (schema `bagnoli_ambiente`) —
   nuove API `/api/public/centraline/*` che joinano sul sibling schema.
3. **Multi-tenant** (più siti SIN) — richiederebbe estensione dello schema
   con colonna `sito_id` su tutte le tabelle, poco invasivo.
4. **i18n** — struttura delle pagine already supporta sostituzione stringhe
   via un dizionario; Next.js App Router ha l'intl integrato.

---

## Appendici

- **`docs/API.md`** — reference completa endpoint HTTP.
- **`docs/DATABASE.md`** — tabelle, relazioni, indici.
- **`docs/ALGORITHMS.md`** — aggregazioni, compressione Gantt, date math.
- **`docs/SECURITY.md`** — modello auth, threat model.
- **`docs/DEPLOYMENT.md`** — procedura completa di deploy e rollback.
- **`docs/IMPORT-DATA.md`** — pipeline Excel → Postgres.
