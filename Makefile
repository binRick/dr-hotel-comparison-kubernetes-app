TAG     ?= v1
IMG_API ?= dr-api:$(TAG)
IMG_WEB ?= dr-web:$(TAG)
NS      ?= dr

.PHONY: help images run-api k3s-load kind-load minikube-load seed deploy status logs clean

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n",$$1,$$2}'

images: ## Build both container images
	docker build -t $(IMG_API) backend
	docker build -t $(IMG_WEB) -f web/Dockerfile .

run-api: ## Run the Go API locally on :8080 (embedded seed)
	cd backend && DATA_PATH=data/seed.json go run .

k3s-load: images ## Build + import images into local k3s
	docker save $(IMG_API) | sudo k3s ctr images import -
	docker save $(IMG_WEB) | sudo k3s ctr images import -

kind-load: images ## Build + load images into a kind cluster
	kind load docker-image $(IMG_API) $(IMG_WEB)

minikube-load: images ## Build + load images into minikube
	minikube image load $(IMG_API)
	minikube image load $(IMG_WEB)

seed: ## Create/refresh the dr-seed ConfigMap from backend/data/seed.json
	kubectl apply -f k8s/namespace.yaml
	kubectl -n $(NS) create configmap dr-seed \
	  --from-file=seed.json=backend/data/seed.json \
	  --dry-run=client -o yaml | kubectl apply -f -

deploy: seed ## Apply manifests + wait for rollout (images must be loaded first)
	kubectl apply -k k8s
	kubectl -n $(NS) rollout status deploy/dr-api  --timeout=120s
	kubectl -n $(NS) rollout status deploy/dr-web  --timeout=120s
	@echo "Open: http://<node-ip>:30080  (or: kubectl -n $(NS) port-forward svc/dr-web 8080:80)"

status: ## Show pods/services/hpa
	kubectl -n $(NS) get pods,svc,hpa

logs: ## Tail the API logs
	kubectl -n $(NS) logs -l app=dr-api -f --max-log-requests=4

clean: ## Delete the namespace (all resources)
	kubectl delete namespace $(NS) --ignore-not-found
