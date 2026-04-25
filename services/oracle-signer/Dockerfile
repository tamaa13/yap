# Oracle signer service for Yap. Designed to run inside a Phala dstack
# TDX enclave. The image must be reproducible — its hash is committed
# in the on-chain oracleKey rotation event so spectators can verify
# the running code matches what they audited.
#
# Build:  docker build -t yap-oracle-signer:v1 .
# Run:    docker run -e ORACLE_SIGNER_SECRET=... -p 3030:3030 yap-oracle-signer:v1
# Deploy: pushed to a registry, referenced from docker-compose.yaml on Phala Cloud.

FROM node:22-alpine AS builder

WORKDIR /app

# Install deps with deterministic lockfile.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && cp -R node_modules /app/runtime-modules \
 && npm install --include=dev --no-audit --no-fund

# Build TypeScript → JavaScript.
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json


FROM node:22-alpine AS runtime

WORKDIR /app

# Non-root user; dstack still gives us TEE isolation but defense-in-depth.
RUN addgroup -S signer && adduser -S signer -G signer

# Pull in only the runtime deps (no devDependencies in production image).
COPY --from=builder --chown=signer:signer /app/runtime-modules /app/node_modules
COPY --from=builder --chown=signer:signer /app/dist /app/dist
COPY --chown=signer:signer package.json /app/

USER signer

# Default port; dstack will publish this via the content-addressed domain.
EXPOSE 3030
ENV NODE_ENV=production

CMD ["node", "/app/dist/server.js"]
