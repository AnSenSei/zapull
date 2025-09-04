# Use nginx to serve static files
FROM nginx:alpine

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

# Copy the HTML files to nginx html directory
COPY index.html /usr/share/nginx/html/index.html.template
COPY about.html /usr/share/nginx/html/about.html

# Copy static files (images, etc.)
COPY static /usr/share/nginx/html/static

# Create a basic nginx configuration
RUN echo 'server {' > /etc/nginx/conf.d/default.conf && \
    echo '    listen 8080;' >> /etc/nginx/conf.d/default.conf && \
    echo '    server_name localhost;' >> /etc/nginx/conf.d/default.conf && \
    echo '    root /usr/share/nginx/html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    index index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    location / {' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '}' >> /etc/nginx/conf.d/default.conf

# Copy startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# Expose port 8080 (required for Cloud Run)
EXPOSE 8080

# Start with environment variable substitution
CMD ["/startup.sh"]