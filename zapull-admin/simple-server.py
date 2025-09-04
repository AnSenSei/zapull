#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
import sys

# Check Python version and import appropriate modules
if sys.version_info[0] == 3:
    import http.server as server
    import socketserver
    HTTPServer = server.HTTPServer
    Handler = server.SimpleHTTPRequestHandler
else:
    import SimpleHTTPServer as server
    import SocketServer as socketserver
    HTTPServer = socketserver.TCPServer
    Handler = server.SimpleHTTPRequestHandler

# Configuration
PORT = 8080
DIST_DIR = "dist"

def main():
    # Check if dist directory exists
    if not os.path.exists(DIST_DIR):
        print("Error: dist directory not found")
        print("Please run build command first")
        sys.exit(1)
    
    # Change to dist directory
    os.chdir(DIST_DIR)
    
    # Create and start server
    try:
        if sys.version_info[0] == 3:
            with socketserver.TCPServer(("", PORT), Handler) as httpd:
                print("Server started successfully!")
                print("Port: " + str(PORT))
                print("Directory: " + os.path.abspath('.'))
                print("Access URL: http://localhost:" + str(PORT))
                print("Press Ctrl+C to stop server")
                print("-" * 50)
                httpd.serve_forever()
        else:
            httpd = HTTPServer(("", PORT), Handler)
            print("Server started successfully!")
            print("Port: " + str(PORT))
            print("Directory: " + os.path.abspath('.'))
            print("Access URL: http://localhost:" + str(PORT))
            print("Press Ctrl+C to stop server")
            print("-" * 50)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        if 'httpd' in locals():
            httpd.shutdown()
    except Exception as e:
        print("Error starting server: " + str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()