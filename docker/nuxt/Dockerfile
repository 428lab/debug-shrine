# Node の版は mise.toml と同じにする(setup.yml が食い違いを見つける)
FROM node:24.22.1-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git ca-certificates \
        vim less \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www
