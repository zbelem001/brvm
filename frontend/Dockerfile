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

# remove default nginx page to avoid serving it if the build output is empty or misplaced
RUN rm -rf /usr/share/nginx/html/*

# use custom nginx configuration so SPA routes fall back to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# copy the actual built app from the angular dist/browser folder
# the build output puts runtime files inside a 'browser' directory
COPY --from=builder /app/dist/frontend/browser/ /usr/share/nginx/html/

# expose http
EXPOSE 80

# run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
