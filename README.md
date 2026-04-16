# Bagnoli Monitor — Node single container

App Next.js 14 read-only che si connette al tuo PostgreSQL esistente.

**URL:** https://monitoraggio.analist24.it.com

## Principi

- ✅ **1 container** Node.js
- ✅ DB Postgres **fuori** dal container (il tuo, già installato)
- ✅ Connessione via **`DATABASE_URL`** nel `.env`
- ❌ **Nessun** importer, Celery, Redis, worker, cron
- ❌ **Nessuna** logica di scrittura/parsing (read-only)

## Stack

- **Next.js 14** (App Router) — frontend React + API routes in 1 processo Node
- **TypeScript**
- **Prisma** — ORM, legge le tue tabelle con `prisma db pull`
- **Tailwind CSS** + **shadcn/ui** — UI
- **frappe-gantt** — Gantt interattivo
- **Leaflet** — mappa GIS
- **recharts** — grafici

## Avvio locale (sviluppo)

```bash
# 1. Clona + installa
git clone <repo> bagnoli-monitor && cd bagnoli-monitor
npm install

# 2. Configura .env
cp .env.example .env
# modifica DATABASE_URL con il tuo Postgres

# 3. Leggi lo schema dal tuo DB (genera Prisma types)
npx prisma db pull
npx prisma generate

# 4. Dev server
npm run dev
# → http://localhost:3000
```

## Deploy produzione (server aaPanel)

```bash
cd /www/wwwroot/bagnoli-monitor
git pull
./docker-run.sh
```

Lo script fa: `docker build` → stop/rm vecchio container → `docker run` nuovo.

### Nginx aaPanel — vhost

```nginx
server {
    listen 443 ssl http2;
    server_name monitoraggio.analist24.it.com;

    ssl_certificate     /etc/letsencrypt/live/monitoraggio.analist24.it.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoraggio.analist24.it.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### DNS

A record `monitoraggio.analist24.it.com` → IP del server aaPanel.

### SSL

```bash
sudo certbot certonly --webroot -w /www/wwwroot/bagnoli-monitor \
  -d monitoraggio.analist24.it.com \
  --email develop@webgo.srl
```

## Struttura

```
bagnoli-monitor/
├── Dockerfile
├── docker-run.sh          # script deploy
├── .env.example
├── package.json
├── next.config.mjs        # output: 'standalone'
├── prisma/schema.prisma   # da popolare con prisma db pull
└── src/
    ├── app/               # pagine Next.js + api routes
    ├── components/        # UI riutilizzabili
    └── lib/db.ts          # Prisma client singleton
```

## Le 6 viste (richieste dall'admin)

| URL | Vista PDF originale | Tabelle lette |
|---|---|---|
| `/` | Cruscotto | aggregati (COUNT, SUM) |
| `/cronoprogramma` | CronoProgramma | `task` + `cup` |
| `/scadenze` | Scadenze GO + STOP | `task` filtrati per data |
| `/milestone` | Milestone | `task WHERE is_milestone=TRUE` |
| `/gantt` | Gantt | `task` + `intervento` |
| `/mappa` | (nuovo, non in PDF) | `unita_intervento` PostGIS |

## Roadmap (ridotta)

| Sprint | Giorni | Cosa |
|---|---|---|
| 0 | 1 | Scaffold + connessione DB |
| 1 | 3 | Home + Cronoprogramma |
| 2 | 2 | Scadenze + Milestone |
| 3 | 3 | Gantt + CUP detail |
| 4 | 2 | Mappa GIS |
| 5 | 1-2 | Dockerize + deploy |

**Totale: ~2 settimane.**

## Cosa serve da te

- [ ] DB Postgres accessibile (host, porta, utente read-only)
- [ ] Schema tabelle applicato (`schema_postgres.sql`)
- [ ] DB popolato (anche parziale per test)
- [ ] DNS `monitoraggio.analist24.it.com` configurato
- [ ] Repo git creato (GitHub/GitLab)
- [ ] Conferma read-only (no form inserimento)
