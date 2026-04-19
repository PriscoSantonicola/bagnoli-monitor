# k8s — Manifest Kubernetes per Bagnoli Monitor

Per la guida completa vedi [`../docs/KUBERNETES.md`](../docs/KUBERNETES.md).

## Deploy rapido

```bash
# 1. Crea il Secret con i valori veri (non committato)
kubectl create namespace bagnoli-monitor
kubectl -n bagnoli-monitor create secret generic bagnoli-monitor-secret \
  --from-literal=DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB' \
  --from-literal=ADMIN_PASS='CHANGE_ME' \
  --from-literal=SESSION_SECRET='CHANGE_ME_64_HEX'

# 2. Secret per pull image dal GitLab Registry (se privato)
kubectl -n bagnoli-monitor create secret docker-registry gitlab-registry \
  --docker-server=gitlab-dev.sviluppo-sw.it:5005 \
  --docker-username=<gitlab-user> --docker-password=<deploy-token>

# 3. Applica tutto via kustomize
kubectl apply -k .

# 4. Verifica rollout
kubectl -n bagnoli-monitor rollout status deployment/bagnoli-monitor
kubectl -n bagnoli-monitor get pods
```

## File inclusi

| File | Ruolo |
|---|---|
| `namespace.yaml` | Crea il namespace `bagnoli-monitor` |
| `configmap.yaml` | Variabili non riservate (`NEXT_PUBLIC_SITE_URL`, `PORT`, `NODE_ENV`, `ADMIN_USER`) |
| `secret.example.yaml` | Template — **NON applicare direttamente**. Creare il Secret via `kubectl create` |
| `deployment.yaml` | 2 replica, probes, limits, securityContext non-root |
| `service.yaml` | ClusterIP 80 → 3000 |
| `ingress.yaml` | TLS Let's Encrypt + forwarded headers (nginx-ingress) |
| `hpa.yaml` | Autoscaler 2-6 replica su CPU 70% / Memory 80% (commentato in kustomization) |
| `kustomization.yaml` | Applicabile con `kubectl apply -k .` |
