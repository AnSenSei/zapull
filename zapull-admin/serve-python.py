#!/usr/bin/env python3
import os
import sys
import http.server
import socketserver

# Configuration
PORT = 8080
DIST_DIR = "dist"

def main():
    # Check if dist directory exists
    if not os.path.exists(DIST_DIR):
        print("Error: dist directory not found")
        print("Please run build command first: npm run build:skip:prod")
        sys.exit(1)
    
    # Change to dist directory
    os.chdir(DIST_DIR)
    
    # Create HTTP server with CORS support
    class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            super().end_headers()
        
        def do_OPTIONS(self):
            self.send_response(200)
            self.end_headers()
    
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print("Server started successfully!")
        print("Port: " + str(PORT))
        print("Directory: " + os.path.abspath('.'))
        print("Access URL: http://localhost:" + str(PORT))
        print("Press Ctrl+C to stop server")
        print("-" * 50)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
            httpd.shutdown()

if __name__ == "__main__":
    main()