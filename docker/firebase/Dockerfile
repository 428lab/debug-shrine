FROM node:18-bullseye-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates \
        vim less \
        openjdk-11-jre-headless fonts-noto-cjk \
        build-essential libpixman-1-dev libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && npm install -g firebase-tools \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN dpkgArch="$(dpkg --print-architecture)"; \
    case "$dpkgArch" in \
        arm64) export PKG_CONFIG_PATH="/usr/lib/aarch64-linux-gnu/pkgconfig/"; \
               npm install --build-from-source canvas ;; \
    esac;
