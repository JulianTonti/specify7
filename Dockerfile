
FROM ubuntu:18.04 AS common

LABEL maintainer="Specify Collections Consortium <github.com/specify>"

RUN apt-get update && apt-get -y install --no-install-recommends \
        python3.6 \
        libldap-2.4-2 \
        libmariadbclient18 \
        && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 999 specify && \
        useradd -r -u 999 -g specify specify

RUN mkdir -p /home/specify && chown specify.specify /home/specify
RUN mkdir -p /opt/specify7 && chown specify.specify /opt/specify7


#####################################################################

FROM common AS build-common

RUN apt-get update && apt-get -y install --no-install-recommends \
        build-essential \
        ca-certificates \
        git

#####################################################################

FROM build-common AS build-frontend

RUN apt-get -y install --no-install-recommends \
        nodejs \
        npm

USER specify

COPY --chown=specify:specify specifyweb/frontend /home/specify/frontend
WORKDIR /home/specify/frontend/js_src

RUN make


#####################################################################

FROM build-common AS build-backend

RUN apt-get -y install --no-install-recommends \
        libldap2-dev \
        libmariadbclient-dev \
        libsasl2-dev \
        python3-venv \
        python3.6-dev

USER specify
COPY --chown=specify:specify requirements.txt /home/specify/

WORKDIR /opt/specify7
RUN python3.6 -m venv ve && ve/bin/pip install --no-cache-dir -r /home/specify/requirements.txt

COPY --chown=specify:specify . /opt/specify7
COPY --from=build-frontend /home/specify/frontend/static/js specifyweb/frontend/static/js

RUN make specifyweb/settings/build_version.py

WORKDIR specifyweb/settings

RUN echo \
        "import os" \
        "\nDATABASE_NAME = os.environ['DATABASE_NAME']" \
        "\nDATABASE_HOST = os.environ['DATABASE_HOST']" \
        "\nDATABASE_PORT = os.environ.get('DATABASE_PORT', '')" \
        "\nMASTER_NAME = os.environ['MASTER_NAME']" \
        "\nMASTER_PASSWORD = os.environ['MASTER_PASSWORD']" \
        > local_specify_settings.py

RUN echo "import os \nDEBUG = os.environ.get('SP7_DEBUG', '').lower() == 'true'\n" \
        > debug.py

RUN echo "import os \nSECRET_KEY = os.environ['SECRET_KEY']\n" \
        > secret_key.py

WORKDIR /opt/specify7
RUN ve/bin/pip install --no-cache-dir gunicorn

######################################################################

FROM common AS run

RUN apt-get update && apt-get -y install --no-install-recommends \
	apache2 \
        libapache2-mod-wsgi-py3 \
        openjdk-11-jre-headless \
        && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN rm /etc/apache2/sites-enabled/*
RUN ln -s /opt/specify7/specifyweb_apache.conf /etc/apache2/sites-enabled/
RUN ln -sf /dev/stderr /var/log/apache2/error.log && ln -sf /dev/stdout /var/log/apache2/access.log

USER specify
WORKDIR /home/specify
RUN mkdir wb_upload_logs specify_depository logs

USER root
COPY --from=build-backend /opt/specify7 /opt/specify7

EXPOSE 8000
USER specify
WORKDIR /opt/specify7
RUN mv specifyweb.wsgi specifyweb_wsgi.py
CMD ve/bin/gunicorn -w 3 -b 0.0.0.0:8000 specifyweb_wsgi
