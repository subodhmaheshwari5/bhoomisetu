FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

RUN addgroup -S bhoomisetu && adduser -S bhoomisetu -G bhoomisetu
USER bhoomisetu

EXPOSE 4000
CMD ["node", "dist/server.js"]
