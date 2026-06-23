#!/usr/bin/env bash
# Install single-node k3s on `mia`, alongside the existing Docker Compose stack.
#
#   --disable traefik    ports 80/443 belong to the ximg nginx container
#   --disable servicelb  we expose via NodePort, not LoadBalancer (no klipper)
#
# metrics-server is left enabled so the HorizontalPodAutoscaler works.
set -euo pipefail

if command -v k3s >/dev/null 2>&1; then
  echo "k3s already installed: $(k3s --version | head -1)"
else
  echo "==> installing k3s (traefik + servicelb disabled)"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_EXEC="--disable traefik --disable servicelb --write-kubeconfig-mode 644" \
    sh -
fi

echo "==> waiting for node to be Ready"
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
for _ in $(seq 1 60); do
  if k3s kubectl get nodes 2>/dev/null | grep -q ' Ready '; then
    k3s kubectl get nodes
    echo "k3s is ready."
    exit 0
  fi
  sleep 2
done

echo "node did not become Ready in time" >&2
exit 1
