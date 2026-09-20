# ── build ────────────────────────────────────────────────────────────
# Debian rather than Alpine: better-sqlite3 has glibc prebuilds, and when it
# does fall back to node-gyp the toolchain below is what it needs.
FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── run ──────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS run
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3539 \
    FLEXIPAL_DB=/data/flexipal.db

# The server runs TypeScript through tsx and @fastify/vite reads vite.config at
# boot, so the full dependency tree comes across rather than a prod-only subset.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY --from=build /app/server       ./server
COPY --from=build /app/shared       ./shared
COPY --from=build /app/client       ./client
COPY --from=build /app/prompts      ./prompts
COPY --from=build /app/profiles.json ./profiles.json
COPY --from=build /app/package.json  ./package.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/tsconfig.json  ./tsconfig.json

# Session state lives on a volume; the image itself stays stateless.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 3539

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3539)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
