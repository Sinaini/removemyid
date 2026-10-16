# --- Build: compile the Vite app to static files ---
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# VITE_* values are inlined into the bundle at build time, so they must be
# passed as build args (Coolify injects build-time env vars as --build-arg).
ARG VITE_GA_MEASUREMENT_ID
ARG VITE_FORMSPREE_FORM_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID \
    VITE_FORMSPREE_FORM_ID=$VITE_FORMSPREE_FORM_ID

COPY . .
RUN npm run build

# --- Serve: plain nginx, no Node at runtime ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
