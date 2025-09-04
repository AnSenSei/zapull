# Stage 1: Build the Vue application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application (skip TypeScript checking for now)
RUN npm run build:skip:prod

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install timezone data
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose ports
EXPOSE 80 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]