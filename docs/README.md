# Bagnoli Monitor — Documentazione tecnica

Benvenuto nella documentazione tecnica di **Bagnoli Monitor**, il software
di monitoraggio pubblico e riservato del Programma di Rigenerazione
Bagnoli-Coroglio (Commissario Straordinario del Governo).

**Repo**: <https://github.com/PriscoSantonicola/bagnoli-monitor>
**Live**: <https://monitoraggio.analist24.it.com>

---

## Indice

| Documento | Cosa contiene |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack tecnologico, topologia di deployment, data flow, scelte architetturali, struttura del repository |
| [API.md](./API.md) | Reference completa di tutte le API HTTP (pubbliche, admin, auth) con schemi request/response ed esempi curl / JS / Python |
| [DATABASE.md](./DATABASE.md) | Schema `bagnoli_cantieri`, tabelle, colonne, relazioni, indici, migrazioni |
| [ALGORITHMS.md](./ALGORITHMS.md) | Regole di calcolo KPI, aggregazione macro-aree, compressione Gantt RLE, coordinate SVG timeline, HMAC sign/verify, date math, validazione redirect |
| [SECURITY.md](./SECURITY.md) | Modello auth (cookie HMAC SHA-256), threat model STRIDE, hardening container, procedure di rotation e incident response |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deploy automatizzato + manuale, setup nginx + SSL, rollback, disaster recovery, CI/CD |
| [IMPORT-DATA.md](./IMPORT-DATA.md) | Pipeline Excel → Postgres: script Python, cross-check, idempotenza, estensioni |

---

## Quick navigation per ruolo

### Sono un frontend/backend developer, voglio consumare le API
→ [API.md](./API.md) § 2 (pubbliche JSON) + esempi § 8.

### Devo sviluppare nuove feature o estendere il sistema
→ [ARCHITECTURE.md](./ARCHITECTURE.md) § 4 (struttura repo) + § 5 (runtime) +
[DATABASE.md](./DATABASE.md) § 1 (inventario tabelle) +
[ALGORITHMS.md](./ALGORITHMS.md) (regole business).

### Devo deployare in produzione un clone del sistema
→ [DEPLOYMENT.md](./DEPLOYMENT.md) § 4 (setup da zero) +
[SECURITY.md](./SECURITY.md) § 2 (cookie config) +
[IMPORT-DATA.md](./IMPORT-DATA.md) § 3 (caricamento dati iniziale).

### Ho ricevuto un nuovo Excel, devo ri-caricarlo
→ [IMPORT-DATA.md](./IMPORT-DATA.md) § 7.

### Devo fare un audit di sicurezza
→ [SECURITY.md](./SECURITY.md) completo, check § 8.

### Ho un incidente in produzione
→ [DEPLOYMENT.md](./DEPLOYMENT.md) § 8 (disaster recovery) +
[SECURITY.md](./SECURITY.md) § 7 (incident response).

---

## Overview rapida

**Cosa fa**:
- Frontend pubblico (`/`) con dashboard di trasparenza aggregata.
- Area riservata (`/admin/*`) che replica 1:1 il file Excel del
  Commissariato (6 sheet: Cruscotto, CronoProgramma, Scadenze GO/STOP,
  Timeline MILESTONE, Gantt).
- API JSON pubbliche (`/api/public/*`) consumabili da terzi.
- Autenticazione admin via cookie firmato HMAC SHA-256 (no Basic Auth
  modale).

**Come funziona**:
```
[Internet]
    ↓ HTTPS
[Nginx aaPanel (sup-dep.ddns.net)]
    ↓ reverse proxy
[Docker container bagnoli-monitor - Next.js 14]
    ↓ pg pool
[Postgres 16 Hetzner (schema bagnoli_cantieri)]
```

**Stack**:
- Next.js 14 (App Router) + TypeScript
- `pg` (node-postgres) — no ORM
- HMAC SHA-256 via Web Crypto
- Docker + docker compose
- nginx reverse proxy (aaPanel)

**Dati** (versione Excel 2.12, aprile 2026):
- 12 CUP, € 443,2 M budget
- 22 task Cruscotto, 325 righe CronoProgramma gerarchico
- 24 scadenze, 18 milestone, 233 righe Gantt
- 34 gare d'appalto, € 32,9 M importo base

---

## Convenzioni di documentazione

- **Percorsi Windows** sono usati per gli script di sviluppo (eseguiti su
  workstation).
- **Percorsi Unix** sono usati per il server aaPanel.
- **Comandi** in bash sono compatibili sia con Git Bash su Windows sia
  con shell Linux.
- **URL d'esempio** usano sempre `https://monitoraggio.analist24.it.com`.
- **Credenziali** sono omesse dai documenti e conservate in
  `~/.claude/secrets.md` (locale, fuori repo).

---

## Versioning

| Versione doc | Data | Software ver. | Note |
|---|---|---|---|
| 1.0 | 2026-04-19 | commit `24b20e3` | Prima release documentazione tecnica completa; stack autoconsistente docker compose; auth cookie HMAC; 6 sheet admin completi; 1182 check Excel vs DB OK |

In caso di nuove revisioni, aggiornare questa tabella + il relativo doc
modificato.

---

## Contatti & ownership

- **Sviluppo**: team Webgo — `develop@webgo.srl`
- **Committente**: Commissariato Straordinario Bagnoli-Coroglio
- **Admin DB Hetzner**: esterno al team (contatto tramite committente)
- **Repo GitHub**: `PriscoSantonicola/bagnoli-monitor`
