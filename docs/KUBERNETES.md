# Bagnoli Monitor — Deployment su Kubernetes

Guida operativa per l'admin-ops che intende portare Bagnoli Monitor su un
cluster Kubernetes (sviluppo o produzione interna).

Autore destinatario: team DevOps "Sviluppo-SW" — lo stesso che gestisce
i repo GitLab interni e che ha richiesto la conversione.

---

## 1. Panoramica

L'applicazione **Bagnoli Monitor** è un singolo container stateless
Next.js (Node 20 Alpine, porta 3000). Le dipendenze esterne sono:

- un PostgreSQL (schema `bagnoli_cantieri`) raggiungibile dal cluster;
- un reverse proxy / Ingress per la terminazione TLS.

Nessuno stato locale, nessun volume persistente richiesto.

**Risorse consigliate per pod**:
- CPU: `200m` request, `500m` limit
- Memory: `256Mi` request, `512Mi` limit
- Replicas: 2 (minimo per alta disponibilità)

---

## 2. Prerequisiti

- Cluster Kubernetes 1.28+ con `kubectl` configurato.
- Un **container registry** raggiungibile dal cluster (es. GitLab Registry:
  `gitlab-dev.sviluppo-sw.it:5005`).
- Un **Ingress controller** (nginx-ingress, Traefik, ecc.) già installato.
- **cert-manager** se si vuole TLS automatico Let's Encrypt.
- Accesso al PostgreSQL (schema `bagnoli_cantieri`) dal cluster:
  host raggiungibile + firewall aperto.

---

## 3. Build & push immagine

### 3.1 Build locale + push a GitLab Registry

```bash
# Login registry (token personal o deploy token)
docker login gitlab-dev.sviluppo-sw.it:5005

# Build tagged
docker build \
  -t gitlab-dev.sviluppo-sw.it:5005/wish/bagnoli/demo-bagnoli-cantieri:latest \
  -t gitlab-dev.sviluppo-sw.it:5005/wish/bagnoli/demo-bagnoli-cantieri:$(git rev-parse --short HEAD) \
  .

docker push gitlab-dev.sviluppo-sw.it:5005/wish/bagnoli/demo-bagnoli-cantieri:latest
docker push gitlab-dev.sviluppo-sw.it:5005/wish/bagnoli/demo-bagnoli-cantieri:$(git rev-parse --short HEAD)
```

### 3.2 Build automatizzato via GitLab CI/CD

Il repo include `.gitlab-ci.yml` che:

1. Builda l'immagine con Kaniko (no docker-in-docker).
2. Tagga con `$CI_COMMIT_SHA` e `latest`.
3. La pusha al GitLab Registry del progetto.
4. (opzionale) Applica il manifest K8s al cluster target via `kubectl`.

Vedi la sezione 7 per il file CI completo.

---

## 4. Manifest Kubernetes

Tutti i file vivono nella cartella `k8s/` del repo:

```
k8s/
├── namespace.yaml
├── configmap.yaml
├── secret.example.yaml     # da copiare e compilare, NON committare i segreti veri
├── deployment.yaml
├── service.yaml
├── ingress.yaml
└── kustomization.yaml
```

### 4.1 Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

Crea il namespace `bagnoli-monitor` che isola tutte le risorse del
progetto.

### 4.2 Secret (`bagnoli-monitor-secret`)

Conserva i valori riservati: `DATABASE_URL`, `ADMIN_PASS`,
`SESSION_SECRET`.

**Creazione da riga di comando** (preferito — non lascia segreti in Git):

```bash
kubectl -n bagnoli-monitor create secret generic bagnoli-monitor-secret \
  --from-literal=DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB' \
  --from-literal=ADMIN_USER='admin' \
  --from-literal=ADMIN_PASS='CHANGE_ME' \
  --from-literal=SESSION_SECRET='CHANGE_ME_64_HEX_CHARS'
```

Per generare `SESSION_SECRET`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 4.3 ConfigMap (`bagnoli-monitor-config`)

Contiene i valori NON riservati (`NEXT_PUBLIC_SITE_URL`, `PORT`,
`NODE_ENV`):

```bash
kubectl apply -f k8s/configmap.yaml
```

### 4.4 Deployment

```bash
kubectl apply -f k8s/deployment.yaml
```

Caratteristiche:

- `replicas: 2` (HA base).
- `strategy: RollingUpdate maxSurge=1 maxUnavailable=0`.
- `livenessProbe` + `readinessProbe` su `/api/public/avanzamento`.
- `securityContext.runAsNonRoot: true` (user 1001).
- Pulling dal registry configurato con `imagePullSecrets`.

### 4.5 Service

```bash
kubectl apply -f k8s/service.yaml
```

`ClusterIP` interno porta 80 → pod:3000. L'Ingress farà il bridging da
fuori.

### 4.6 Ingress

```bash
kubectl apply -f k8s/ingress.yaml
```

Configurato per nginx-ingress-controller. Include annotazioni per cert-manager
(TLS Let's Encrypt automatico) e per forwardare gli header
`X-Forwarded-*` che l'app richiede per le redirect corrette.

### 4.7 Deploy "all in one" via kustomize

```bash
kubectl apply -k k8s/
```

---

## 5. Verifica post-deploy

```bash
# Pod healthy?
kubectl -n bagnoli-monitor get pods

# Endpoint pronti?
kubectl -n bagnoli-monitor get svc

# Ingress attivo?
kubectl -n bagnoli-monitor get ingress

# Log di un pod
kubectl -n bagnoli-monitor logs -l app=bagnoli-monitor --tail 100 -f

# Exec shell nel pod per debug
kubectl -n bagnoli-monitor exec -it deploy/bagnoli-monitor -- sh

# Healthcheck interno
kubectl -n bagnoli-monitor port-forward svc/bagnoli-monitor 3000:80
# poi in un altro terminale:
curl http://localhost:3000/api/public/avanzamento
```

Stati attesi:

- `kubectl get pods` → `Running 2/2 Ready`.
- Probes liveness/readiness → `OK` nei log.
- `/api/public/avanzamento` → JSON 200.

---

## 6. Scaling

### 6.1 Manuale

```bash
kubectl -n bagnoli-monitor scale deployment/bagnoli-monitor --replicas=4
```

### 6.2 HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: bagnoli-monitor
  namespace: bagnoli-monitor
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: bagnoli-monitor
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

```bash
kubectl apply -f k8s/hpa.yaml
```

---

## 7. GitLab CI/CD — build + deploy automatico

Il repo include `.gitlab-ci.yml` che esegue due stage:

1. **build**: usa Kaniko per buildare l'immagine Docker senza daemon
   (richiede solo un pod Kubernetes), tagga con SHA e `latest`, pusha al
   registry del progetto.

2. **deploy** (opzionale, manuale): applica i manifest al cluster target.
   Richiede un token `KUBE_TOKEN` nella variabili CI del progetto.

Esempio file:

```yaml
variables:
  IMAGE: $CI_REGISTRY_IMAGE
  TAG:   $CI_COMMIT_SHORT_SHA

stages:
  - build
  - deploy

build:
  stage: build
  image:
    name: gcr.io/kaniko-project/executor:v1.22.0-debug
    entrypoint: [""]
  script:
    - mkdir -p /kaniko/.docker
    - echo "{\"auths\":{\"$CI_REGISTRY\":{\"auth\":\"$(echo -n $CI_REGISTRY_USER:$CI_REGISTRY_PASSWORD | base64)\"}}}" > /kaniko/.docker/config.json
    - /kaniko/executor
        --context    "${CI_PROJECT_DIR}"
        --dockerfile "${CI_PROJECT_DIR}/Dockerfile"
        --destination "$IMAGE:$TAG"
        --destination "$IMAGE:latest"
  only:
    - main

deploy:
  stage: deploy
  image: bitnami/kubectl:1.28
  when: manual
  script:
    - echo "$KUBECONFIG_DATA" | base64 -d > /tmp/kubeconfig
    - export KUBECONFIG=/tmp/kubeconfig
    - sed -i "s|IMAGE_PLACEHOLDER|$IMAGE:$TAG|g" k8s/deployment.yaml
    - kubectl apply -k k8s/
    - kubectl -n bagnoli-monitor rollout status deployment/bagnoli-monitor --timeout=120s
  only:
    - main
```

Variabili CI/CD da configurare nel progetto GitLab:

| Variabile | Valore |
|---|---|
| `KUBECONFIG_DATA` | contenuto kubeconfig codificato base64 |
| `CI_REGISTRY_*`   | auto-popolate da GitLab |

---

## 8. Troubleshooting

### 8.1 `CrashLoopBackOff`

```bash
kubectl -n bagnoli-monitor logs -l app=bagnoli-monitor --previous --tail 100
```

Cause frequenti:
- `DATABASE_URL` sbagliata → il container parte ma healthcheck fallisce
  perché le query DB fanno errore.
- `SESSION_SECRET` mancante → il middleware ritorna 503 sulla prima
  richiesta e il readiness probe fallisce.
- Immagine tag non esistente → `ImagePullBackOff`.

### 8.2 Ingress 502 / 504

Verificare che:
- il Service punti al Deployment (`kubectl describe svc bagnoli-monitor`);
- il pod sia `Ready`;
- il targetPort sia 3000 (match dell'app);
- i probe siano passati (se `Readiness` fallisce, il pod non riceve
  traffico).

### 8.3 Redirect login tornano sull'host sbagliato

L'app usa `X-Forwarded-Host` / `X-Forwarded-Proto`. Verifica che
l'Ingress li forwardi — nginx-ingress lo fa di default, Traefik richiede
config esplicita.

### 8.4 Connessione al DB fallisce

```bash
kubectl -n bagnoli-monitor exec -it deploy/bagnoli-monitor -- sh
# dentro al pod:
wget -O- http://127.0.0.1:3000/api/public/avanzamento  # ritorna error DB?

# Test manuale:
apk add postgresql-client
psql "$DATABASE_URL" -c "SELECT 1"
```

Se il test `psql` fallisce dall'interno del pod:
- verifica firewall del DB (potrebbe non consentire l'IP di egress del cluster);
- verifica `NetworkPolicy` (se attive, devono consentire outbound 5432);
- verifica DNS del cluster (il pod risolve l'hostname del DB?).

---

## 9. Sicurezza

- **Secret** in `Secret` (non in `ConfigMap`). Rotation via
  `kubectl create secret --dry-run -o yaml | kubectl apply -f -`.
- **SecurityContext** `runAsNonRoot: true`, user 1001 (già configurato
  nel Dockerfile).
- **NetworkPolicy** suggerita: egress verso il DB + cluster DNS, ingress
  solo dal namespace dell'Ingress controller.
- **ReadOnlyRootFilesystem**: non attivabile oggi perché Next.js scrive
  in `/tmp` e `.next/cache`. Da valutare con `emptyDir` volumes.
- **PodSecurityStandards**: compatibile con `restricted` (no privileges,
  no hostpath, non-root, no capabilities aggiuntive).

---

## 10. Monitoring in K8s

Suggerimenti minimi:

- **Prometheus**: esportare metriche Next.js via plugin (oggi non
  configurato).
- **Grafana**: dashboard standard "Kubernetes pod metrics" è sufficiente
  per iniziare.
- **Log aggregation**: Loki / Elastic per raccogliere gli stdout del
  container (già json-formatted).
- **Alerting**: alert su `kube_pod_status_phase != Running` per >5 min.

---

## 11. Checklist go-live K8s

Prima di dichiarare l'ambiente pronto:

- [ ] Immagine buildata e pushata al registry con tag `latest` + `<sha>`.
- [ ] Secret `bagnoli-monitor-secret` creato nel namespace.
- [ ] ConfigMap applicato.
- [ ] Deployment applicato, `kubectl rollout status` completato.
- [ ] Pod `2/2 Ready`.
- [ ] Service interno risponde al port-forward.
- [ ] Ingress attivo, TLS valido (`openssl s_client -connect host:443`).
- [ ] Healthcheck `/api/public/avanzamento` ritorna 200 da fuori.
- [ ] Homepage `/` renderizza macro-aree corrette.
- [ ] Login `/admin` funziona (cookie firmato).
- [ ] Log pod puliti (no `ERROR` / `Deprecation` bloccanti).
- [ ] HPA configurato (se traffico atteso ≥ 5 req/s).
- [ ] Backup del `Secret` archiviato in vault centrale.

---

## 12. Manifest esempi

I file reali sono in `k8s/` del repo. Qui un riassunto veloce:

### `k8s/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: bagnoli-monitor
```

### `k8s/configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: bagnoli-monitor-config
  namespace: bagnoli-monitor
data:
  NEXT_PUBLIC_SITE_URL: "https://bagnoli-monitor.sviluppo-sw.it"
  PORT: "3000"
  NODE_ENV: "production"
  ADMIN_USER: "admin"
```

### `k8s/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bagnoli-monitor
  namespace: bagnoli-monitor
  labels: { app: bagnoli-monitor }
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector: { matchLabels: { app: bagnoli-monitor } }
  template:
    metadata:
      labels: { app: bagnoli-monitor }
    spec:
      imagePullSecrets:
        - name: gitlab-registry
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: app
          image: gitlab-dev.sviluppo-sw.it:5005/wish/bagnoli/demo-bagnoli-cantieri:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef: { name: bagnoli-monitor-config }
            - secretRef:    { name: bagnoli-monitor-secret }
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits:   { cpu: 500m, memory: 512Mi }
          livenessProbe:
            httpGet: { path: /api/public/avanzamento, port: 3000 }
            initialDelaySeconds: 20
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet: { path: /api/public/avanzamento, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
```

### `k8s/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: bagnoli-monitor
  namespace: bagnoli-monitor
spec:
  type: ClusterIP
  selector: { app: bagnoli-monitor }
  ports:
    - name: http
      port: 80
      targetPort: 3000
```

### `k8s/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bagnoli-monitor
  namespace: bagnoli-monitor
  annotations:
    nginx.ingress.kubernetes.io/use-forwarded-headers: "true"
    nginx.ingress.kubernetes.io/forwarded-headers: "X-Forwarded-Host,X-Forwarded-Proto,X-Forwarded-For"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - bagnoli-monitor.sviluppo-sw.it
      secretName: bagnoli-monitor-tls
  rules:
    - host: bagnoli-monitor.sviluppo-sw.it
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: bagnoli-monitor
                port:
                  number: 80
```

### `k8s/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: bagnoli-monitor
resources:
  - namespace.yaml
  - configmap.yaml
  - deployment.yaml
  - service.yaml
  - ingress.yaml
```
