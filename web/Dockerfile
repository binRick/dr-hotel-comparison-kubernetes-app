# dr-web — nginx serving the static frontend + /api proxy to dr-api.
# Build context is the REPO ROOT:  docker build -t dr-web -f web/Dockerfile .
FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/ /usr/share/nginx/html/
EXPOSE 8080
