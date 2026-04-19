# Bagnoli Monitor

Dashboard pubblico + area riservata per il **Programma di Rigenerazione Bagnoli-Coroglio** (Commissario Straordinario del Governo).

**Live:** https://monitoraggio.analist24.it.com

## Stack

- **Next.js 14** (App Router) – frontend React + route handler API
- **TypeScript** – tipizzazione completa
- **`pg` (node-postgres)** – pool di connessione al Postgres esterno (schema `bagnoli_cantieri`)
- **Docker + docker-compose** – stack autoconsistente (1 comando per partire)
- **HMAC SHA-256** – cookie di sessione firmato per l'area `/admin` (no Basic Auth modale)

## Principi

- ✅ **Stack autoconsistente**: `docker compose up -d --build` e parte
- ✅ **Read-only**: la UI non scrive sul DB (solo letture)
- ✅ **Single container** in produzione, DB Postgres esterno gestito separatamente
- ✅ **Profilo `dev`**: Postgres locale opzionale per sviluppo offline
- ❌ Nessun worker, nessun Redis, nessun Celery, nessuna cron interna

## Avvio rapido (produzione o staging)

```bash
# 1. Clona
git clone https://github.com/PriscoSantonicola/bagnoli-monitor
cd bagnoli-monitor

# 2. Configura env
cp .env.example .env
# Compilare: DATABASE_URL, ADMIN_PASS, SESSION_SECRET
# Genera SESSION_SECRET con:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Avvia
docker compose up -d --build

# 4. Verifica
curl -I http://127.0.0.1:3000/                    # 200 OK
curl -I http://127.0.0.1:3000/api/public/avanzamento
docker compose ps
docker compose logs -f app
```

Il container espone `127.0.0.1:3000`: esporlo al pubblico via reverse proxy
(nginx / traefik / caddy) con SSL.

## Avvio con DB Postgres locale (sviluppo)

```bash
# Porta su il db-dev (Postgres 16 Alpine) oltre all'app
docker compose --profile dev up -d --build

# Il Postgres locale ascolta su 127.0.0.1:5434
# Impostare nel .env:
# DATABASE_URL=postgresql://devbagnolicrm:<DB_DEV_PASSWORD>@host.docker.internal:5432/devbagnolicrm
```

Lo schema `schema_cantieri.sql` viene applicato automaticamente al primo boot
(tramite `/docker-entrypoint-initdb.d/`).

## Comandi operativi

```bash
docker compose up -d --build       # avvia / ricostruisce
docker compose down                # ferma (mantiene volumi)
docker compose down -v             # ferma e cancella volumi (db-dev)
docker compose logs -f app         # segui i log del container app
docker compose restart app         # riavvia solo l'app
docker compose pull                # se usi un'immagine pre-built
```

## Nginx reverse proxy (es. aaPanel)

```nginx
server {
    listen 443 ssl http2;
    server_name monitoraggio.analist24.it.com;

    ssl_certificate     /etc/letsencrypt/live/monitoraggio.analist24.it.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoraggio.analist24.it.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

L'app usa gli header `X-Forwarded-Host` / `X-Forwarded-Proto` per costruire le
redirect (es. dopo login). Senza questi header le redirect tornano all'origine
`127.0.0.1:3000`, quindi configurarli nel reverse proxy è richiesto.

## Pagine

**Pubbliche (no auth):**

| URL | Descrizione |
|---|---|
| `/` | Homepage trasparenza: hero gauge + 3 macro-aree (Risanamento/Rigenerazione/Trasversali) + budget + gare + open data |
| `/login` | Pagina login (cookie sessione firmato, niente Basic Auth modale) |
| `/api/public/avanzamento` | JSON: KPI globali, aggregazione per macro-area |
| `/api/public/finanze` | JSON: totali finanziamenti, gare, breakdown per macro-area |
| `/api/cruscotto` | JSON legacy (compat) |

**Area riservata `/admin` (cookie richiesto, 6 sheet Excel replicati):**

| URL | Descrizione |
|---|---|
| `/admin` | Indice con stats sintetiche e navigazione ai 6 sheet |
| `/admin/sheet/cruscotto` | Dashboard replica Excel con quadro sinottico + 14 filtri + task table con mini-Gantt |
| `/admin/sheet/cronoprogramma` | Albero gerarchico 325 righe |
| `/admin/sheet/scadenze-go` | 12 scadenze "in avvio" |
| `/admin/sheet/scadenze-stop` | 12 scadenze "in conclusione" |
| `/admin/sheet/timeline-milestone` | SVG timeline con simboli Risanamento (cerchi verdi) / Realizzazione (quadrati blu) |
| `/admin/sheet/gantt` | Griglia calendario 2021-10 → 2030-06 con barre task |

## Variabili d'ambiente (`.env`)

| Chiave | Obbligatoria | Esempio |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://monitoraggio.analist24.it.com` |
| `PORT` | ✅ | `3000` |
| `ADMIN_USER` |   | `admin` (default) |
| `ADMIN_PASS` | ✅ | password accesso admin |
| `SESSION_SECRET` | ✅ | 64 caratteri hex random (HMAC SHA-256) |
| `DB_DEV_PASSWORD` |   | solo con `--profile dev` |

Tutti i campi sono documentati in `.env.example`.

## Sicurezza

- Cookie `bagnoli_session` firmato HMAC-SHA256 con `SESSION_SECRET`
- Flags: `HttpOnly` + `Secure` + `SameSite=Lax`
- Durata: 30 giorni con "Ricordami", 8 ore altrimenti
- Middleware Edge runtime verifica signature + scadenza su ogni request `/admin/*`
- Password errata → redirect a `/login?err=1` con messaggio rosso
- Logout via `POST /api/logout` cancella il cookie

## Struttura progetto

```
.
├── Dockerfile                  # Multistage Node 20 Alpine (standalone build)
├── docker-compose.yml          # stack autoconsistente
├── .env.example                # template variabili
├── next.config.mjs             # output: 'standalone'
├── package.json
├── schema_cantieri.sql         # schema DB (applicato automaticamente con --profile dev)
└── src/
    ├── app/
    │   ├── page.tsx            # Homepage pubblica
    │   ├── login/page.tsx      # Form login
    │   ├── api/
    │   │   ├── login/route.ts  # POST: verifica credenziali + setta cookie
    │   │   ├── logout/route.ts # POST: cancella cookie
    │   │   ├── public/         # API pubbliche JSON
    │   │   └── cruscotto/      # API legacy
    │   └── admin/
    │       ├── page.tsx        # Indice 6 sheet
    │       └── sheet/
    │           ├── cruscotto/
    │           ├── cronoprogramma/
    │           ├── scadenze-go/
    │           ├── scadenze-stop/
    │           ├── timeline-milestone/
    │           └── gantt/
    ├── components/             # Client + Server components condivisi
    ├── lib/
    │   ├── db.ts               # pg Pool singleton
    │   ├── format.ts           # formatter IT (Euro, date, %)
    │   └── session.ts          # HMAC sign/verify (Edge-safe Web Crypto)
    └── middleware.ts           # Guard /admin/* → redirect /login
```
