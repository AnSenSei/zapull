# Build stage
FROM node:20-alpine AS builder

# Add libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# ---- Accept build arguments for all environment variables ----
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_API_USER_URL
ARG NEXT_PUBLIC_GACHA_API_BASE_URL
ARG NEXT_PUBLIC_ACHIEVEMENT_CHECK_URL

# ---- Set environment variables from build arguments (so next build can inline them) ----
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_USER_URL=$NEXT_PUBLIC_API_USER_URL
ENV NEXT_PUBLIC_GACHA_API_BASE_URL=$NEXT_PUBLIC_GACHA_API_BASE_URL
ENV NEXT_PUBLIC_ACHIEVEMENT_CHECK_URL=$NEXT_PUBLIC_ACHIEVEMENT_CHECK_URL

# ---- Debug: print PK tail to guarantee pk_live is present BEFORE build ----
RUN echo "PK tail before build: ${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: -8}"

# ---- Guard: if repo has .env/.env.production with pk_test, move them away for this build ----
RUN [ -f .env.production ] && mv .env.production .env.production.bak || true
RUN [ -f .env ] && mv .env .env.bak || true

# Build the application (Next.js will inline NEXT_PUBLIC_* at build time)
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

# Add non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Runtime env
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Start the application (Next standalone)
CMD ["node", "server.js"]