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
# copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# expose http
EXPOSE 80

# run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
