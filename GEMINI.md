# Gemini Code Assistant Documentation

This document provides an overview of the project structure, setup, and commands to help Gemini Code Assistant understand and assist with this project.

## Project Overview

This project appears to be a trading card application. It includes a user-facing frontend, an admin frontend, two backend services, and a set of cloud functions. The backend services are built with Python and FastAPI, while the cloud functions are written in Node.js.

## Directory Structure

-   `admin_frontend/`: Contains the HTML, CSS, and JavaScript for the admin interface.
-   `backend/`: The main backend service, likely handling core application logic. It's a FastAPI application.
-   `frontend/`: The user-facing frontend, composed of static HTML, CSS, and JavaScript files.
-   `functions/`: Contains Node.js cloud functions, likely for handling events and background tasks.
-   `user_backend/`: A separate backend service, likely for user management, authentication, and payments. It's also a FastAPI application.
-   `uploads/`: A directory for file uploads.

## Backend Services (`backend` and `user_backend`)

The `backend` and `user_backend` services are Python applications built with the FastAPI framework.

### Setup

To set up the environment for either backend service, create a `.env` file in the respective directory (`backend/` or `user_backend/`). You can copy the `.env.template` or `.env.sample` to get started.

### Dependencies

The Python dependencies are listed in `backend/requirements.txt` and `user_backend/requirements.txt`. Key dependencies include:

-   `fastapi`
-   `uvicorn`
-   `pydantic`
-   `google-cloud-storage`
-   `google-cloud-firestore`
-   `stripe`
-   `shippo`
-   `algoliasearch`

### Running the Services

To run either backend service, navigate to the appropriate directory and run:

```bash
python main.py
```

## Cloud Functions (`functions`)

The `functions` directory contains Node.js cloud functions for Firebase.

### Dependencies

The Node.js dependencies are listed in `functions/package.json`. Key dependencies include:

-   `firebase-admin`
-   `firebase-functions`

### Commands

The following commands are available for the cloud functions:

-   **Lint:** `npm run lint`
-   **Serve locally:** `npm run serve`
-   **Deploy:** `npm run deploy`

## Frontend (`frontend` and `admin_frontend`)

The `frontend` and `admin_frontend` directories contain the static assets for the user-facing and admin web interfaces. They are built with HTML, CSS, and JavaScript.

## Top-Level Scripts

The root directory contains several Python scripts for various tasks:

-   `clean_up_expiring_card.py`: A script to handle expiring cards.
-   `ship_info.py`: A script related to shipping information.
-   `test_*.py`: Various test scripts.

## Deployment

The `deploy.sh` and `deployment-commands.sh` scripts in the root directory are likely used for deploying the application.
