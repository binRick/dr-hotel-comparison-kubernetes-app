# 🇩🇴 Dominican Republic Hotel & Area Comparison

[![Release images](https://github.com/binRick/dr-hotel-comparison-kubernetes-app/actions/workflows/release.yml/badge.svg)](https://github.com/binRick/dr-hotel-comparison-kubernetes-app/actions/workflows/release.yml)
[![CI](https://github.com/binRick/dr-hotel-comparison-kubernetes-app/actions/workflows/ci.yml/badge.svg)](https://github.com/binRick/dr-hotel-comparison-kubernetes-app/actions/workflows/ci.yml)

A self-contained, **Kubernetes-native** web app for comparing the regions of the
Dominican Republic — **Punta Cana, Cap Cana, Puerto Plata, Samaná, La Romana,
Santo Domingo, Barahona** — and the top hotels within each, side by side and via
a weighted *"what suits you"* scoring engine.

- **42 real hotels** across **7 areas**, with honest descriptions, specs,
  coordinates, prices and ratings — researched from public sources.
- **165 self-hosted photos** (Wikimedia Commons + official hotel sites, credited
  in the dataset; never hot-linked).
- A **Go** API (single static binary) + an **nginx** frontend, both running as
  Kubernetes Deployments. CPU **autoscaling** (HPA), rolling updates, ConfigMap-
  driven data.

> Deployable on **any** cluster — k3s, kind, or minikube — with no external
> dependencies. (It also runs behind an existing reverse proxy; see
> [Running behind an existing nginx](#running-behind-an-existing-nginx).)

## Architecture

```
            ┌──────────────────── Kubernetes namespace: dr ─────────────────────┐
 Browser ──▶│  Service dr-web  (NodePort 30080)                                  │
            │      └─ Deployment dr-web  · nginx ×2                               │
            │            ├─ /          → static frontend (vanilla JS + photos)   │
            │            └─ /api/*      → Service dr-api (ClusterIP)              │
            │                                └─ Deployment dr-api · Go ×2 + HPA   │
            │                                      └─ seed.json via ConfigMap     │
            └────────────────────────────────────────────────────────────────────┘
```

Two tiers, one entry point. `dr-web` serves the SPA and reverse-proxies `/api`
to `dr-api` over the cluster network — so the browser only ever talks to one
origin and there is no CORS or external image dependency.

## Quick start

Requires Docker + a single-node Kubernetes cluster and `kubectl`.

```bash
# 1. Build images
docker build -t dr-api:v1 backend
docker build -t dr-web:v1 -f web/Dockerfile .

# 2. Make the images available to your cluster's runtime
#    k3s:      docker save dr-api:v1 | sudo k3s ctr images import -   # repeat for dr-web:v1
#    kind:     kind load docker-image dr-api:v1 dr-web:v1
#    minikube: minikube image load dr-api:v1 dr-web:v1

# 3. Deploy
kubectl apply -f k8s/namespace.yaml
kubectl -n dr create configmap dr-seed --from-file=seed.json=backend/data/seed.json
kubectl apply -k k8s

# 4. Open it
#    http://<node-ip>:30080
#    or:  kubectl -n dr port-forward svc/dr-web 8080:80   → http://localhost:8080
```

Or use the **Makefile**: `make help`, then e.g. `make kind-load deploy`.

To run just the API locally (no cluster): `make run-api` → <http://localhost:8080/api/areas>.

## API

Base path `/api`. JSON in, JSON out.

| Route | Purpose |
|-------|---------|
| `GET /api/health` | liveness/readiness |
| `GET /api/meta` | counts + the weightable dimensions |
| `GET /api/areas` | all areas |
| `GET /api/areas/{id}` | one area + its hotels |
| `GET /api/hotels` | hotels; filters: `area, board, adults_only, family, beachfront, max_price, min_rating, sort` |
| `GET /api/hotels/{id}` | one hotel |
| `GET /api/compare?type=hotel\|area&ids=a,b,c` | side-by-side payload |
| `POST /api/score` | body `{type:"area"\|"hotel", weights:{...}, area?}` → ranked match scores |

**Scoring dimensions** — areas: `beach, nightlife, family, value, nature,
culture, safety, walkability, low_sargassum`; hotels: `rating, value, luxury,
family, romance, beach, activities`. Example:

```bash
curl -s localhost:8080/api/score -X POST \
  -d '{"type":"area","weights":{"beach":3,"nature":2,"low_sargassum":2}}' | jq '.results[0].area.name'
# → "Samaná & Las Terrenas"
```

## Container images

Tagging a release (`git tag v0.1.0 && git push --tags`) runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds
both images for **linux/amd64 + linux/arm64** and pushes them to GitHub
Container Registry:

```
ghcr.io/binrick/dr-api:<version>   ghcr.io/binrick/dr-api:latest
ghcr.io/binrick/dr-web:<version>   ghcr.io/binrick/dr-web:latest
```

Deploy straight from the registry — no local build needed:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n dr create configmap dr-seed --from-file=seed.json=backend/data/seed.json
kubectl apply -k k8s
kubectl -n dr set image deploy/dr-api dr-api=ghcr.io/binrick/dr-api:latest
kubectl -n dr set image deploy/dr-web dr-web=ghcr.io/binrick/dr-web:latest
```

(First publish: make the two packages public under the repo's *Packages* settings
if you want anonymous pulls.)

## Project layout

```
backend/        Go API (stdlib only) — model, store, scoring, handlers, Dockerfile, data/seed.json
web/            nginx image (Dockerfile + nginx.conf) serving the frontend + /api proxy
frontend/       Vanilla-JS SPA (no frameworks/CDNs): pages, dr.css, app.js, favicon, images/
k8s/            namespace, dr-api Deployment/Service, dr-web Deployment/Service, HPA, kustomization, (optional) ingress
deploy/         install-k3s.sh, build-and-load.sh, nginx-dr.snippet.conf
scripts/        integrate.py — rebuilds seed.json + self-hosts photos from the research output
Makefile        build / load / deploy helpers
```

## Data

`backend/data/seed.json` was produced by a multi-agent research pass over public
sources, then finalized by `scripts/integrate.py`, which downloads each photo,
downscales it, stores it under `frontend/images/`, and rewrites the dataset to
local paths. Every image keeps its `source`, `credit`, and `license`. To
regenerate from a fresh research output (`backend/data/seed.raw.json`):

```bash
python3 scripts/integrate.py
```

Data and photos are gathered from public sources for a demonstration/educational
project; hotel details and prices are approximate and not booking-accurate.

## Running behind an existing nginx

Because the whole app is one NodePort, fronting it with TLS is a one-liner — point
a reverse proxy at `host:30080`. The reference deployment lives at
**dr.ximg.app**; see [`deploy/nginx-dr.snippet.conf`](deploy/nginx-dr.snippet.conf).

## License

Code: MIT (see `LICENSE`). Photos remain under their original licenses as
credited in `backend/data/seed.json`.
