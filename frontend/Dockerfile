FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL is baked into the static build at build time, since Vite env
# vars are compile-time, not runtime. In docker-compose this defaults to a
# same-origin /api path, which nginx.conf below proxies to the backend
# service — no separate origin/CORS to configure for the container setup.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
