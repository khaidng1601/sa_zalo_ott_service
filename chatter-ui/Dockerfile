FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ARG REACT_APP_GRAPHQL_URL=/graphql
ENV REACT_APP_GRAPHQL_URL=${REACT_APP_GRAPHQL_URL}
ENV CI=false

RUN pnpm run build

FROM nginx:alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
