FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
