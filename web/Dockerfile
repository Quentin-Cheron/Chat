FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_RESOLVER_BASE_URL=""
ARG VITE_PUBLIC_JOIN_BASE_URL=""
ENV VITE_RESOLVER_BASE_URL=${VITE_RESOLVER_BASE_URL}
ENV VITE_PUBLIC_JOIN_BASE_URL=${VITE_PUBLIC_JOIN_BASE_URL}

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
