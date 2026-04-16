# =====================================================================
# Bagnoli Monitor — Next.js 14 single-container Dockerfile
# =====================================================================
# Output immagine: ~130-150 MB (standalone build, node-postgres, no Prisma)
# Porta esposta: 3000
# =====================================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ---------- STAGE 1: install deps ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- STAGE 2: build Next.js ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- STAGE 3: runtime minimal ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utente non-root per sicurezza
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone build contiene server.js + node_modules minimi
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
