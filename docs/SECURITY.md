# Bagnoli Monitor — Security & Threat Model

Documento di riferimento per la sicurezza dell'applicazione. Rivolto agli
sviluppatori che manutengono o estendono il sistema.

---

## 1. Perimetro

Asset pubblicati:

| Asset | URL | Dati |
|---|---|---|
| Frontend pubblico | `/` | dati di trasparenza (aggregati, non personali) |
| API pubbliche | `/api/public/*` | stessi dati, JSON |
| API legacy | `/api/cruscotto` | stessi dati, JSON |
| Login page | `/login` | form — pubblica |
| Area admin | `/admin/*` | dettagli operativi Commissariato, non sensibili |

**Nessun dato personale** è gestito. Nessuna PII, nessun dato finanziario
(IBAN, carte) transita dall'app. Gli unici dati "riservati" sono operativi
(status interno task, gare non ancora pubblicate).

---

## 2. Modello di autenticazione

### 2.1 Scelta

**Stateless token firmato HMAC SHA-256** in cookie httpOnly / secure.
Vedi `docs/ALGORITHMS.md § 7` per i dettagli matematici.

Trade-off:

| Pro | Contro |
|---|---|
| Nessuna tabella `sessions` da mantenere / backup | Non posso revocare una singola sessione (devo ruotare il secret o attendere scadenza) |
| Zero dipendenze extra (Web Crypto nativo) | Secret must-match tra builder e verifier |
| Scalabile (ogni request auto-contenuta) | Payload visibile al client (seppur firmato) — niente dati sensibili nel payload |

### 2.2 Cookie properties

| Flag | Valore | Ragione |
|---|---|---|
| `HttpOnly` | ✅ | Il cookie **non** è leggibile da `document.cookie`, mitiga XSS |
| `Secure` | ✅ | Inviato solo su HTTPS |
| `SameSite=Lax` | ✅ | Previene CSRF cross-site (la form di login è POST same-site) |
| `Path=/` | ✅ | Valido per tutto il dominio (serve per `/admin/*` e `/api/logout`) |
| `Max-Age` | 2.592.000 s (30 gg) se `remember=on`, altrimenti session cookie | "Ricordami" consapevole |

### 2.3 Password

Unica coppia user/pass gestita via env:

```
ADMIN_USER=admin
ADMIN_PASS=<stringa, chiaro, env>
```

Verifica eseguita in `src/app/api/login/route.ts` con uguaglianza esatta.
Non c'è hashing perché:
- Non c'è tabella utenti (l'env è la "fonte di verità").
- Il confronto è già privo di timing side-channel significativo su una
  singola password fissa in env (nessuna enumerazione possibile).

Se in futuro si passerà a un DB `user`:
- Hash con `bcrypt` / `argon2id`.
- Salt per record.
- Rate limiting sul `POST /api/login`.

### 2.4 Rate limiting login

**Assente oggi**. Mitigazioni:

- `SESSION_SECRET` randomizzato (non bruteforce-able offline).
- Password sufficientemente lunga e complessa (`Bagn0li_View_2026!`).
- Monitoraggio log nginx aaPanel per anomalie.

Aggiungere a breve:

```nginx
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=5r/m;

location = /api/login {
  limit_req zone=login_zone burst=3 nodelay;
  proxy_pass http://127.0.0.1:3000;
}
```

---

## 3. Protezioni implementate

### 3.1 Open redirect su `POST /api/login`

Il parametro `next` viene validato via `safeNext(...)`:

- Deve iniziare con `/`.
- Non deve iniziare con `//` (protocol-relative URL).
- Niente scheme (`https://...`) permesso.

Implementazione in `docs/ALGORITHMS.md § 8`.

Test case:

| `next` | Risultato |
|---|---|
| `/admin/sheet/gantt` | OK, redirect a quel path |
| `https://evil.com/` | rifiutato, redirect a `/admin` |
| `//evil.com/` | rifiutato, redirect a `/admin` |
| (vuoto/null) | redirect a `/admin` |

### 3.2 SQL injection

Tutte le query sono:
- **Parametrizzate** con `$1, $2, ...` e array di args (`pg` driver).
- **Non concatenate** da input utente.

La sola query che compone stringhe è quella dei `DISTINCT` per slicer:

```typescript
const distinct = async (col: string) =>
  (await q(`SELECT DISTINCT ${col} AS v FROM crono_task WHERE ${col} IS NOT NULL ORDER BY ${col}`)).map(r => r.v);
```

Qui `col` **non** arriva dall'utente: è hardcoded in `await Promise.all([
distinct("sub_ambito"), distinct("obiettivo_generale"), ...])`. Zero
superficie per injection. In futuro, se il nome colonna diventasse
parametro esterno, wrap con allowlist `if (!ALLOWED_COLS.includes(col))
throw`.

### 3.3 XSS

Next.js con React — tutto l'output HTML è auto-escaped (JSX).
Gli unici contesti `dangerouslySetInnerHTML` sono assenti in questo codice.

Font + Font Awesome sono caricati da CDN via `<link rel="stylesheet">` in
`src/app/layout.tsx`. Integrità SRI **non** impostata al momento — punto di
miglioramento:

```html
<link rel="stylesheet"
      href="https://cdnjs.cloudflare.com/.../all.min.css"
      integrity="sha384-..."
      crossorigin="anonymous" />
```

### 3.4 CSRF

Mitigazioni:

1. Cookie `SameSite=Lax` — previene POST cross-origin automatici.
2. Le uniche mutazioni sono:
   - `POST /api/login` — non richiede cookie preesistente, quindi CSRF
     sarebbe solo tentativo di forzare login (innocuo).
   - `POST /api/logout` — effetto idempotente e non dannoso.
3. Non c'è nessun altro endpoint di scrittura.

Se in futuro si aggiungessero endpoint di mutazione:
- aggiungere CSRF token (doppia submit o header `X-CSRF-Token`).

### 3.5 TLS

- Let's Encrypt rinnovo automatico via `certbot` (cron aaPanel 03:00).
- Protocolli: TLS 1.2 + 1.3 (TLS 1.0/1.1 disabilitati lato nginx aaPanel).
- HSTS attivo nel vhost: `Strict-Transport-Security: max-age=31536000`.

### 3.6 Headers di sicurezza raccomandati

Attualmente nginx aaPanel imposta:
- `Strict-Transport-Security: max-age=31536000`

Da valutare l'aggiunta di:

```nginx
add_header X-Frame-Options           "DENY";
add_header X-Content-Type-Options    "nosniff";
add_header Referrer-Policy           "strict-origin-when-cross-origin";
add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()";
add_header Content-Security-Policy   "default-src 'self'; style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none';";
```

CSP `'unsafe-inline'` per `style-src` / `script-src` è richiesto da Next.js
standalone e dagli inline `style=` delle pagine admin. Per un CSP nonce-based
servirebbe tweak al runtime Next.js (middleware che inietta `nonce`).

### 3.7 Segreti

| Segreto | Dove vive | Esposto? |
|---|---|---|
| `SESSION_SECRET` | `/www/wwwroot/bagnoli-monitor/.env` (600) | No |
| `ADMIN_PASS` | stesso file | No |
| `DATABASE_URL` (pw Hetzner) | stesso file | No |
| Credenziali SSH server | `~/.claude/secrets.md` locale | No (fuori repo) |

`.env` è in `.gitignore` — **mai** committare.
`.dockerignore` esclude `.env` dall'immagine Docker.
Lo script deploy scrive `.env` via SFTP con `chmod 600`.

---

## 4. Threat model (STRIDE-like)

### 4.1 Spoofing

- **Attacco**: attaccante forgia cookie `bagnoli_session`.
- **Difesa**: firma HMAC con secret 256-bit, impossibile senza conoscere il secret.

### 4.2 Tampering

- **Attacco**: utente modifica `exp` del payload per estendere la sessione.
- **Difesa**: signature cambierebbe, verify fallisce.

### 4.3 Repudiation

- **Attacco**: admin dice "non ho fatto io quella operazione".
- **Difesa**: oggi nessun audit log (niente operazioni di scrittura dalla UI).
  Se in futuro si introducessero, aggiungere tabella `audit_log(user, action, ts, ip)`.

### 4.4 Information Disclosure

- **Attacco**: attaccante accede a `/admin/sheet/*` senza credenziali.
- **Difesa**: middleware Edge verifica cookie, ritorna 307 → /login.

- **Attacco**: attaccante intercetta traffico.
- **Difesa**: TLS 1.2+, HSTS, cookie `Secure`.

- **Attacco**: DB leak del `bagnoli_ambiente` sibling schema.
- **Difesa**: il pool `pg` ha credenziali dedicate al `bagnoli_cantieri`;
  admin DB gestisce i grant separatamente. Se il nostro DB user avesse
  accesso in lettura anche a `bagnoli_ambiente`, la UI non lo espone.

### 4.5 Denial of Service

- **Attacco**: flood richieste per saturare il pool `pg` (max 10).
- **Difesa parziale**: healthcheck Docker + restart. Manca rate limiting
  applicativo — da aggiungere su nginx con `limit_req_zone`.

- **Attacco**: POST enorme al `/api/login`.
- **Difesa**: nginx `client_max_body_size` default 1 MB è ampiamente sufficiente
  per form login (bytes).

### 4.6 Elevation of Privilege

- **Attacco**: utente legittimo autenticato accede a risorse fuori perimetro.
- **Difesa**: esiste **un solo ruolo** (admin). Niente livelli di
  autorizzazione. Se si introducessero, aggiungere claim `role` nel payload
  e middleware di guard per route.

---

## 5. Hardening container

### 5.1 Dockerfile

- User non-root `nextjs:nodejs` (uid 1001, gid 1001) — limita l'impatto di
  eventuale RCE nel container.
- Immagine base `node:20-alpine` — footprint minimo.
- `NEXT_TELEMETRY_DISABLED=1` — nessuna telemetria uscente.

### 5.2 docker-compose

- `restart: unless-stopped` — crash recovery automatico.
- Bind `127.0.0.1:3000` — **non** espone la porta sulla rete pubblica (serve
  nginx davanti).
- Network `bagnoli-net` bridge dedicata — isolamento dai container del
  pannello aaPanel.
- Logging rotation `max-size=10m max-file=3` — evita volumi disco infiniti.
- Healthcheck ogni 30 s — container restart se unhealthy.

### 5.3 Runtime

- Read-only root filesystem NON impostato (Next.js scrive in `/tmp` e
  `.next/cache`). Da valutare `tmpfs` mount + `read_only: true`.

---

## 6. Secrets rotation

### 6.1 `SESSION_SECRET`

Rotazione **invaliderebbe** tutti i cookie attivi (tutti gli utenti devono
rifare login). Procedura:

```bash
# 1. Genera nuovo secret
NEW=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Aggiorna .env sul server (via deploy script o manualmente)
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$NEW/" .env

# 3. Restart app
docker compose restart app

# 4. Verifica
curl -sk https://monitoraggio.analist24.it.com/login
# tutti gli utenti esistenti devono loggare di nuovo
```

### 6.2 `ADMIN_PASS`

Stesso procedimento — la nuova password entra in vigore al restart.

### 6.3 `DATABASE_URL`

Gestito da admin DB Hetzner. Se cambia:
1. Admin DB ruota credenziali e ce le comunica.
2. Aggiorniamo `.env` + restart.
3. Testiamo con `docker inspect --format '{{.State.Health.Status}}'`.

---

## 7. Incident response

### 7.1 Sospetto compromesso sessione admin

1. Ruotare `SESSION_SECRET` (invalida tutti i cookie).
2. Ruotare `ADMIN_PASS`.
3. Controllare log nginx per richieste anomale:
   ```bash
   tail -10000 /www/wwwlogs/monitoraggio.analist24.it.com.log | \
     grep -E 'admin|login' | awk '{print $1}' | sort | uniq -c | sort -rn | head
   ```
4. Se IP sospetto identificato, bannarlo a livello nginx o firewall.

### 7.2 Sospetto compromesso DB

Fuori dal nostro controllo (è gestito dall'admin DB). Avvisare immediatamente
chi gestisce `hetzner-dbserver-dev.sviluppo-sw.it`.

### 7.3 Container unhealthy

```bash
docker compose logs --tail 200 app        # cosa dice l'app
docker compose ps                         # stato health
docker inspect bagnoli-monitor --format '{{.State.Health.Log}}' | jq
docker compose restart app                # tentativo soft
docker compose up -d --force-recreate app # tentativo hard
```

Se persiste: controllare raggiungibilità DB (`telnet hetzner-dbserver-dev.sviluppo-sw.it 5432`)
e spazio disco server.

---

## 8. Checklist audit periodico (ogni 6 mesi)

- [ ] Ruotare `SESSION_SECRET`.
- [ ] Verificare che `.env` sul server abbia `chmod 600`.
- [ ] Rinnovare cert Let's Encrypt (cron automatico — verificare log).
- [ ] Aggiornare Node 20 → LTS più recente nel Dockerfile.
- [ ] Aggiornare `next` a patch release più recente (`npm outdated`).
- [ ] `npm audit fix` per vulnerabilità delle deps.
- [ ] Review headers di sicurezza nginx (`curl -I https://.../`).
- [ ] Test end-to-end: login, navigazione sheet, logout.
- [ ] Verifica backup DB Hetzner (responsabilità admin).
