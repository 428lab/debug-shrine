FROM node:18-bullseye-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git ca-certificates \
        vim less \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www
