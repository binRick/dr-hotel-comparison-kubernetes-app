#!/usr/bin/env bash
# Build both images with Docker, import them into k3s's containerd, (re)create the
# seed ConfigMap, apply manifests, and roll out. Run from the repo root on a host
# with Docker + single-node k3s (e.g. `mia`).
#
# Usage: deploy/build-and-load.sh [TAG]
set -euo pipefail

cd "$(dirname "$0")/.."
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
TAG="${1:-v1}"

echo "==> build dr-api:${TAG}"
docker build -t "dr-api:${TAG}" backend
echo "==> build dr-web:${TAG}"
docker build -t "dr-web:${TAG}" -f web/Dockerfile .

echo "==> import images into k3s containerd"
docker save "dr-api:${TAG}" | k3s ctr images import -
docker save "dr-web:${TAG}" | k3s ctr images import -

echo "==> namespace + seed ConfigMap"
k3s kubectl apply -f k8s/namespace.yaml
k3s kubectl -n dr create configmap dr-seed \
  --from-file=seed.json=backend/data/seed.json \
  --dry-run=client -o yaml | k3s kubectl apply -f -

echo "==> apply manifests"
k3s kubectl apply -k k8s
k3s kubectl -n dr set image deploy/dr-api dr-api="dr-api:${TAG}"
k3s kubectl -n dr set image deploy/dr-web dr-web="dr-web:${TAG}"
k3s kubectl -n dr rollout restart deploy/dr-api deploy/dr-web
k3s kubectl -n dr rollout status deploy/dr-api --timeout=120s
k3s kubectl -n dr rollout status deploy/dr-web --timeout=120s

echo "==> health checks (NodePort 30080)"
sleep 2
curl -sf http://127.0.0.1:30080/            -o /dev/null && echo "  web  OK  /"
curl -sf http://127.0.0.1:30080/api/health  && echo "  api  OK  /api/health"
curl -sf http://127.0.0.1:30080/api/meta    && echo
