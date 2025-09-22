# Use official Node.js runtime as base image
FROM node:18-alpine

# Set the working directory in container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001

# Change ownership of the app directory
RUN chown -R discordbot:nodejs /app
USER discordbot

# Expose port (required for Cloud Run health checks)
EXPOSE 8080

# Start the Discord bot
CMD ["node", "src/index.js"]