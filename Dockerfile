FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Install system dependencies for canvas/puppeteer
RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libjpeg-dev \
  libpango1.0-dev \
  libgif-dev \
  librsvg2-dev \
  libpixman-1-dev \
  pkg-config \
  graphicsmagick \
  ghostscript \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
