FROM node:22-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        vim \
        less \
        openjdk-21-jdk-headless \
        fonts-noto-cjk \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

