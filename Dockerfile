# Exact toolchain version; NODE_IMAGE can also be an image@sha256:digest.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        binutils ca-certificates git gzip make g++ python3 tar xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /build \
    && chown node:node /build

ENV CI=true \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /build
USER node

# Lockfile Git dependencies are public. Fetch over HTTPS without host SSH keys.
RUN git config --global url.https://github.com/.insteadOf ssh://git@github.com/ \
    && git config --global --add url.https://github.com/.insteadOf git@github.com:

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
# .git history and initialized lib/ submodules are intentional build inputs.
COPY --chown=node:node . .
RUN sh tools/container-build.sh

# Optional BuildKit export: docker build --output type=local,dest=artifacts/export .
FROM scratch AS artifacts
COPY --from=build /build/artifacts/container/ /
