# Stage 1: builds the wrapper with webpack (Node only here, at build-time).
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json webpack.config.js index.ts config.ts ./
COPY src ./src

RUN npm run build

# Stage 2: only the static files, served by nginx. No Node at runtime.
FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY demo/ /usr/share/nginx/html/demo/
COPY --from=build /app/build /usr/share/nginx/html/build

EXPOSE 80
