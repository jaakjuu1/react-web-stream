# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY public ./public
COPY src ./src

# Build frontend
RUN npm run build

# ============================================
# Stage 2: Build Backend
# ============================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# Copy server package files
COPY server/package.json server/package-lock.json ./

# Install backend dependencies
RUN npm ci

# Copy server source and prisma schema
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Build backend
RUN npm run build

# ============================================
# Stage 3: Production Image
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy server package files and install ALL dependencies (need prisma CLI for migrations)
COPY server/package.json server/package-lock.json ./
RUN npm ci

# Copy Prisma schema and migrations, then generate client
COPY server/prisma ./prisma
RUN npx prisma generate

# Copy built backend from builder stage
COPY --from=backend-builder /app/server/dist ./dist

# Copy built frontend to public directory
COPY --from=frontend-builder /app/dist ./public

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3737
ENV DATABASE_URL="file:/app/data/prod.db"

# Expose port
EXPOSE 3737

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3737/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
