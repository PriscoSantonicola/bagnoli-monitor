# Bagnoli Monitor — Deployment Guide

Procedura completa per deployare l'app in produzione e mantenere in vita
l'infrastruttura.

---

## 1. Infrastruttura target

| Componente | Dove | Chi gestisce |
|---|---|---|
| Server applicativo | aaPanel `sup-dep.ddns.net:223` | Team Webgo (questo repo) |
| DNS `monitoraggio.analist24.it.com` | (provider DNS esterno) | Team Webgo |
| Certificato SSL | Let's Encrypt, cert auto-rinnovati | Server stesso, cron 03:00 |
| Database | `hetzner-dbserver-dev.sviluppo-sw.it:5432` | Admin DB esterno |
| Nginx reverse proxy | aaPanel builtin | Team Webgo |

Accesso SSH server:

```
host:   sup-dep.ddns.net
port:   223
user:   prisco
auth:   password (vedi ~/.claude/secrets.md)
repo:   /www/wwwroot/bagnoli-monitor
```

---

## 2. Deploy automatizzato (script)

Lo script `_deploy_hetzner.py` esegue **tutto** da Windows via SSH:

```bash
cd C:\Users\user\Desktop\Webgo\TRAPANI\PROGETTI\proposta_db\progetto_node
python _deploy_hetzner.py
```

Fasi eseguite:

1. Connessione SSH al server.
2. Scrittura `.env` remoto (SFTP, `chmod 600`).
3. `git fetch --all && git reset --hard origin/main`.
4. Rilevamento binario compose (`docker compose` v2 o `docker-compose` v1).
5. Stop container legacy eventualmente presenti.
6. `docker compose build --no-cache app`.
7. `docker compose up -d --force-recreate app`.
8. Autotune (7 curl di verifica + check healthcheck).

Durata media: ~60-90 secondi.

---

## 3. Deploy manuale (SSH + docker compose)

Se lo script Python non è disponibile:

```bash
# 3.1 Connessione
ssh -p 223 prisco@sup-dep.ddns.net

# 3.2 Repo up to date
cd /www/wwwroot/bagnoli-monitor
git fetch --all
git reset --hard origin/main

# 3.3 .env (solo la prima volta o quando cambiano i segreti)
cp .env.example .env
nano .env         # compilare DATABASE_URL, ADMIN_PASS, SESSION_SECRET
chmod 600 .env

# 3.4 Rebuild + restart
docker compose build --no-cache app
docker compose up -d --force-recreate app

# 3.5 Verifica
docker compose ps
docker inspect --format '{{.State.Health.Status}}' bagnoli-monitor
curl -s http://127.0.0.1:3000/api/public/avanzamento | head
curl -sk -o /dev/null -w '%{http_code}\n' https://monitoraggio.analist24.it.com/
```

Stati health attesi:
- `starting` per i primi 20 secondi.
- `healthy` dopo il primo ok del healthcheck.
- `unhealthy` dopo 5 fallimenti consecutivi → Docker restarta il container.

---

## 4. Setup iniziale server (prima volta)

### 4.1 Prerequisiti

- Docker Engine 24+ installato.
- Plugin `docker compose` (v2) installato.
- User `prisco` con permesso `docker` (gruppo `docker`).

### 4.2 Repo

```bash
cd /www/wwwroot
git clone https://github.com/PriscoSantonicola/bagnoli-monitor
cd bagnoli-monitor
```

### 4.3 Env

```bash
cp .env.example .env
# Genera SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Oppure
python3 -c "import secrets; print(secrets.token_hex(32))"
# Compilare .env con DATABASE_URL, ADMIN_PASS, SESSION_SECRET, ...
chmod 600 .env
```

### 4.4 Nginx vhost

Creare `/www/server/panel/vhost/nginx/monitoraggio.analist24.it.com.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name monitoraggio.analist24.it.com;

    ssl_certificate     /etc/letsencrypt/live/monitoraggio.analist24.it.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitoraggio.analist24.it.com/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5:!3DES;
    add_header          Strict-Transport-Security "max-age=31536000" always;

    # Headers richiesti dall'app per redirect corretti
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;

    # WebSocket/upgrade (Next.js dev HMR o future feature)
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # Webroot per certbot challenge
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/bagnoli-monitor;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name monitoraggio.analist24.it.com;
    location /.well-known/acme-challenge/ {
        root /www/wwwroot/bagnoli-monitor;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

Test config + reload:

```bash
sudo nginx -t && sudo nginx -s reload
```

### 4.5 Certificato SSL

Prima emissione:

```bash
sudo certbot certonly --webroot \
  -w /www/wwwroot/bagnoli-monitor \
  -d monitoraggio.analist24.it.com \
  --email develop@webgo.srl \
  --agree-tos -n
```

Rinnovo automatico (già configurato cron 03:00):

```bash
sudo certbot renew --quiet --deploy-hook "nginx -s reload"
```

### 4.6 Firewall DB

Il Postgres Hetzner richiede allowlist sull'IP pubblico del server aaPanel.
Se cambia l'IP, chiedere ad admin DB di aggiornare.

Verifica raggiungibilità:

```bash
docker exec bagnoli-monitor sh -c "apk add --no-cache postgresql-client && psql '$DATABASE_URL' -c 'SELECT 1'"
```

---

## 5. Rollback

### 5.1 Rollback a commit precedente

```bash
cd /www/wwwroot/bagnoli-monitor
git log --oneline -10               # trova lo sha del rollback target
git reset --hard <sha>
docker compose build --no-cache app
docker compose up -d --force-recreate app
```

### 5.2 Rollback a immagine precedente senza rebuild

```bash
# Tag current come backup prima del deploy
docker tag bagnoli-monitor:latest bagnoli-monitor:rollback-$(date +%s)

# In caso di rollback:
docker tag bagnoli-monitor:rollback-XXXX bagnoli-monitor:latest
docker compose up -d --force-recreate app
```

Per abilitare questo workflow, aggiungere allo script deploy un `docker tag`
prima del rebuild.

### 5.3 Rollback `.env`

Le vecchie versioni di `.env` **non** sono versionate (giustamente). Per
tener traccia dei segreti storicamente usati:

- Mantenere `~/.claude/secrets.md` aggiornato (locale, fuori repo).
- Prima di ogni rotation, copiare `.env` con timestamp:
  ```bash
  cp .env .env.$(date +%Y%m%d-%H%M%S).bak
  ```

---

## 6. Monitoring post-deploy

### 6.1 Check manuali

```bash
# 1. Container up
docker compose ps

# 2. Healthcheck
docker inspect --format '{{.State.Health.Status}}' bagnoli-monitor

# 3. Log ultimi 100 righe
docker compose logs --tail 100 app

# 4. Pubblico raggiungibile
curl -sk -o /dev/null -w '%{http_code}\n' https://monitoraggio.analist24.it.com/

# 5. API
curl -sk https://monitoraggio.analist24.it.com/api/public/avanzamento | python3 -m json.tool | head -20

# 6. Admin protetto
curl -sk -o /dev/null -w '%{http_code}\n' https://monitoraggio.analist24.it.com/admin
# expect 307
```

### 6.2 Script autotune

Ogni deploy esegue lo script di autotune che verifica:

- Container up + healthy
- `GET /api/public/avanzamento` → 200 JSON
- `GET /` → 200
- `GET /login` → 200
- `GET /admin` senza cookie → 307 → /login
- `POST /api/login` valido → 303 + cookie
- `GET /admin` con cookie → 200
- HTTPS pubblico → 200

Se qualcosa non torna, interrompere e investigare prima che gli utenti se ne accorgano.

---

## 7. Manutenzione ordinaria

### 7.1 Aggiornamento deps

```bash
# Locale:
npm outdated
npm update next react react-dom
git commit -am "deps: bump Next.js to X.Y.Z"
git push
python _deploy_hetzner.py
```

### 7.2 Aggiornamento Node 20 → 22 (futuro)

1. Modifica `FROM node:20-alpine` → `FROM node:22-alpine` in Dockerfile.
2. Verifica `package.json` `engines` compatibility.
3. Local test: `docker compose build app`.
4. Commit + deploy.

### 7.3 Pulizia Docker

Periodicamente liberare spazio dalle immagini obsolete:

```bash
docker image prune -f                    # rimuove dangling
docker image prune -a --filter "until=720h" -f   # rimuove inutilizzate > 30 gg
docker system df                          # audit spazio
```

### 7.4 Backup

Il DB è gestito esternamente → backup sotto responsabilità admin DB.
Il repo è su GitHub → backup implicito.
L'unico stato NON versionato che va backup-ato è il file `.env` del server
(contiene `SESSION_SECRET` e `ADMIN_PASS`). Conservato in
`~/.claude/secrets.md` locale + inventariato su 1Password / Bitwarden se
serve.

---

## 8. Disaster recovery

### 8.1 Server aaPanel irraggiungibile

1. Verificare SSH raggiungibilità.
2. Se giù da provider → risolvere lato infrastructure.
3. Se problema applicativo → spinning up dell'app su un nuovo host:
   ```bash
   ssh nuovo-host
   cd /www/wwwroot
   git clone https://github.com/PriscoSantonicola/bagnoli-monitor
   cd bagnoli-monitor
   # Ricreare .env dai secrets di backup
   cp ~/backup/.env .
   chmod 600 .env
   docker compose up -d --build
   ```
4. Aggiornare DNS `monitoraggio.analist24.it.com` → nuovo IP.

### 8.2 DB Hetzner irraggiungibile

Il container va in `unhealthy` e la homepage ritorna 500. Mitigazioni:

- Mostrare una pagina "manutenzione" statica (aggiungere `/maintenance` +
  nginx fallback).
- Attivare `--profile dev` con Postgres locale come fallback (rischio:
  dati non allineati).

Attivare modalità manutenzione manualmente:

```nginx
# Sostituire location / con:
location / {
    return 503;
}
error_page 503 /maintenance.html;
location = /maintenance.html {
    root /www/wwwroot/bagnoli-monitor/public;
    internal;
}
```

### 8.3 Recupero `.env` perso

1. Generare nuovi `SESSION_SECRET` + `ADMIN_PASS`.
2. Copiare `DATABASE_URL` dal portale Hetzner (o chiedere admin DB).
3. Ricreare `.env`, restart.
4. Tutti gli utenti devono rifare login (cookie invalidati).

---

## 9. CI / CD (futuro)

Stato attuale: deploy via script locale Python. Non c'è GitHub Actions.

Setup suggerito:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host:     ${{ secrets.SSH_HOST }}
          port:     ${{ secrets.SSH_PORT }}
          username: ${{ secrets.SSH_USER }}
          password: ${{ secrets.SSH_PASS }}
          script: |
            cd /www/wwwroot/bagnoli-monitor
            git pull origin main
            docker compose build --no-cache app
            docker compose up -d --force-recreate app
            sleep 10
            curl -sf http://127.0.0.1:3000/api/public/avanzamento || exit 1
```

Secrets GitHub da aggiungere: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PASS`.

---

## 10. Checklist pre-deploy

Prima di ogni deploy significativo:

- [ ] `npm run build` pulito in locale (no errori TS).
- [ ] Commit pushato su `main`.
- [ ] Verifica che `.env` sul server contenga tutti i segreti richiesti.
- [ ] Se modifica schema DB → `_apply_schema_hetzner.py` prima del deploy app.
- [ ] Se modifica responsive CSS → test su mobile (Chrome DevTools device mode).
- [ ] Se modifica API pubbliche → aggiornare `docs/API.md`.
- [ ] Se modifica algoritmi aggregazione → aggiornare `docs/ALGORITHMS.md`
  + ri-runnare `_crosscheck_excel_db.py`.

Post-deploy:

- [ ] `docker compose ps` → Up (healthy).
- [ ] `curl /api/public/avanzamento` → 200 + JSON atteso.
- [ ] `curl /admin` senza cookie → 307.
- [ ] Login end-to-end da browser → 200 sulle 6 pagine sheet.
- [ ] Log `docker compose logs --tail 50 app` → nessun error.
