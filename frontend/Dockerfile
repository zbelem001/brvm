# frontend/Dockerfile
# build Angular app and serve with nginx

# --- build stage -----------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# copy package manifests and install
COPY package.json package-lock.json ./
RUN npm ci --silent

# copy sources and build
COPY . .
# adjust output path if your angular.json specifies something else
RUN npm run build -- --output-path=dist

# --- production image ------------------------------------------------------
FROM nginx:alpine
# copy built assets from builder (copy contents, not the folder itself)
# remove default nginx page to avoid serving it if the build output is empty or misplaced
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# expose http
EXPOSE 80

# run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
