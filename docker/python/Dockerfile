FROM python:3.7
USER root

RUN apt-get update
RUN apt-get -y install locales && \
    localedef -f UTF-8 -i ja_JP ja_JP.UTF-8
ENV LANG ja_JP.UTF-8
ENV LANGUAGE ja_JP:ja
ENV LC_ALL ja_JP.UTF-8
ENV TZ JST-9
ENV TERM xterm

RUN apt-get install -y vim less
RUN pip install --upgrade pip
RUN pip install --upgrade setuptools
RUN pip install scipy
RUN pip install matplotlib
RUN pip install kaggle

WORKDIR /var/www/src
# ARG API_NAME
# ARG API_KEY
# RUN mkdir -p ~/.kaggle
# RUN API_DATA="{\"username\":\"${API_NAME}\",\"key\":\"${API_KEY}\"}" && \
#     echo ${API_DATA} > ~/.kaggle/kaggle.json && \
#     chmod 600 ~/.kaggle/kaggle.json
# RUN kaggle datasets download sudalairajkumar/novel-corona-virus-2019-dataset && \
#     rm -rf *.csv && unzip *.zip && rm -rf *.zip