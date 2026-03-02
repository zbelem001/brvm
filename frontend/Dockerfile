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
# Angular defaults to placing files under dist/frontend (project name).
# either adjust the build path or copy from the subfolder later.
# here we set the output explicit to avoid surprises
RUN npm run build -- --output-path=dist/frontend

# --- production image ------------------------------------------------------
FROM nginx:alpine
# copy built assets from builder (copy contents, not the folder itself)
# remove default nginx page to avoid serving it if the build output is empty or misplaced
RUN rm -rf /usr/share/nginx/html/*
# copy the actual built app from the angular dist folder
COPY --from=builder /app/dist/frontend/ /usr/share/nginx/html/

# expose http
EXPOSE 80

# run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
