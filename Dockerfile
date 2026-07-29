# syntax = docker/dockerfile:1

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV="production"

# Throw-away build stage to reduce size of final image
FROM base AS build

ARG LITESTREAM_VERSION=v0.3.13
ARG SQLITE_YEAR=2025
ARG SQLITE_VERSION=3500400

# Install packages needed to download and build stuff
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    build-essential \
    node-gyp \
    pkg-config \
    python-is-python3 \
    wget \
    ca-certificates \
    libreadline-dev

WORKDIR /build

# Download and unpack the static build of Litestream
RUN arch=$(arch | sed s/aarch64/arm64/ | sed s/x86_64/amd64/) && \
    wget https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz && \
    tar -zf litestream-v0.3.13-linux-${arch}.tar.gz -C /usr/local/bin -x

# Download and build SQLite
RUN wget https://www.sqlite.org/${SQLITE_YEAR}/sqlite-autoconf-${SQLITE_VERSION}.tar.gz && \
    tar xzf sqlite-autoconf-${SQLITE_VERSION}.tar.gz && \
    cd sqlite-autoconf-${SQLITE_VERSION}/ && \
    ./configure --prefix=/usr/local --enable-readline && make && make install

# Back to app
WORKDIR /app

# Install node modules
COPY package-lock.json package.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Final stage for app image
FROM base

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libreadline8 \
    && rm -rf /var/lib/apt/lists/*

# Copy built application and other files from build stage
COPY --from=build /app /app

# Certs so we can connect to Tigris over https
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Litestream and SQLite binaries
COPY --from=build /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /usr/local/bin/sqlite3 /usr/local/bin/sqlite3

# Copy local files we need
COPY ./litestream.yml /etc/litestream.yml
COPY ./run.sh /app/run.sh

# Setup sqlite3 on a separate volume
ENV DB_DIR=/data
RUN mkdir -p /data
VOLUME /data

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "/app/run.sh" ]
