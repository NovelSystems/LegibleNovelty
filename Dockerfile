# Legible Novelty — application container (Stage 0).
#
# Node version pinned: 24 (Active LTS). Must agree with .nvmrc, package.json's
# "engines", and "packageManager" fields. Package manager: pnpm via Corepack.
FROM node:24-alpine

# --- Optional TLS-inspecting-proxy CA support (inert without a ca-bundle.crt) ---
# Some networks (corporate / sandbox egress proxies) re-terminate TLS with a
# private CA. If a `ca-bundle.crt` is present in the build context (it is
# gitignored and absent in a normal setup), append it to the system trust
# bundle so Corepack and pnpm can reach the package registry. On a normal
# machine this block is a no-op and NODE_EXTRA_CA_CERTS simply points at the
# stock system bundle the base image already ships.
COPY package.json ca-bundle.cr[t] /ca-src/
RUN if [ -f /ca-src/ca-bundle.crt ]; then \
      cat /ca-src/ca-bundle.crt >> /etc/ssl/certs/ca-certificates.crt; \
    fi \
    && rm -rf /ca-src
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
# -------------------------------------------------------------------------------

# Enable Corepack so the exact pnpm version pinned in package.json's
# "packageManager" field is the one used inside the container. Without this,
# pnpm does not exist in the image at all.
RUN corepack enable

WORKDIR /app

# Install dependencies first, for Docker layer caching. The Prisma schema is
# copied in before install so the "postinstall": "prisma generate" hook can
# run during the build and bake the generated Prisma Client into node_modules.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source.
COPY . .

EXPOSE 3000

# Default command for `docker compose up`; overridden by check.sh's
# `docker compose run` invocations.
CMD ["pnpm", "run", "dev"]
