FROM node:16-buster-slim

RUN apt-get update && \
    apt-get -y install locales && \
    localedef -f UTF-8 -i ja_JP ja_JP.UTF-8
ENV LANG ja_JP.UTF-8
ENV LANGUAGE ja_JP:ja
ENV LC_ALL ja_JP.UTF-8
ENV TZ JST-9
ENV TERM xterm
ENV HOST 0.0.0.0

RUN apt-get update && \
    apt-get install -y vim less

RUN apt-get update && \
    apt-get install -y curl openjdk-11-jre-headless fonts-noto-cjk

RUN npm install -g firebase-tools

WORKDIR /app
