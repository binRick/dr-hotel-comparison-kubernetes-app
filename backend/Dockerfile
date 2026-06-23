# ── build ────────────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY . .
# Pure stdlib, no modules to download. Static binary for a scratch image.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /dr-api .

# ── run ──────────────────────────────────────────────────────────────────────
FROM scratch
COPY --from=build /dr-api /dr-api
EXPOSE 8080
# nobody:nobody — matches runAsUser in the k8s securityContext
USER 65534:65534
ENTRYPOINT ["/dr-api"]
