# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project: User Backend Service (FastAPI)

Core workflows
- Setup (local)
  - Python 3.11 is expected (Dockerfile base). Use a virtualenv.
    - python -m venv .venv && source .venv/bin/activate
    - pip install -r requirements.txt
- Run the API (dev)
  - With autoreload: uvicorn main:app --host 0.0.0.0 --port 8082 --reload
  - Or plain Python (also reloads via uvicorn in __main__): python main.py
- Environment
  - Copy a template and set values: cp .env.template .env
  - The app loads .env automatically (python-dotenv). See README.md for variables (GCS/Firestore/DB/Stripe, etc.).
- Docker
  - Build: docker build -t user-backend:local .
  - Run: docker run --env-file .env -p 8082:8082 user-backend:local
- Tests
  - Pytest-based tests exist (e.g., tests/test_payment_saga.py). Pytest is not in requirements.txt; install it first: pip install pytest
  - Run all: pytest -q
  - Run a single test case: pytest tests/test_payment_saga.py::TestRechargePaymentSaga::test_successful_recharge_without_referral -q
  - Some scripts are executable test clients that hit a running local server (ensure the API is running on :8082):
    - python tests/test_top_level.py
    - python tests/test_achievements.py calculate-level <user_id>
    - python tests/test_draw_cards.py <user_id> <pack_id> <collection_id> [count]
    - python tests/test_high_rarity_cards.py <user_id> <pack_id> <collection_id> [count]
    - python tests/test_withdrawal_fee.py <user_id> <address_id> <phone_number>
    - python tests/test_withdrawal_fee_unit.py
- Lint/format
  - No lint/format tooling is defined in this repo (no config or dependencies found). If needed, install and run your preferred tool, but there is no canonical command here.

High-level architecture
- Entry point and app composition
  - main.py defines two FastAPI apps:
    - A top-level gateway app (title: "User Service API - Main Gateway") serving HTML at /, /users, /users/ and mounting the versioned API.
    - A versioned sub-API mounted at /users/api/v1, where all real endpoints live.
  - CORS is open for all origins in dev; OpenTelemetry instrumentation is applied via config.instrument_app.
  - Startup/shutdown hooks:
    - On startup: tests SQL connectivity (config.test_connection) and ensures payment tables exist (service.payment_service.ensure_payment_tables_exist).
    - On shutdown: closes DB connections (config.close_connector).
- Middleware and security
  - SessionMiddleware is added to the sub-API with a generated secret key each run.
  - A custom idempotency middleware (middleware.idempotency.idempotency_middleware) wraps the sub-API HTTP pipeline, used for payment safety.
  - OpenAPI schema is customized to include a Firebase bearer JWT security scheme (“FirebaseBearer”).
- Routers (mounted on /users/api/v1)
  - Accounts, cards, marketplace, listings, rank, payments, achievements, fusion, withdraw, history, packs.
  - These live under router/ and define the domain-specific endpoints. Listings for marketplace are exposed via router.marketplace_router.listings_router in addition to the main marketplace router.
- Data and external services
  - SQL: Cloud SQL (Postgres) via cloud-sql-python-connector/pg8000/asyncpg. Payment service ensures required tables exist.
  - Firestore: google-cloud-firestore used by services and payment sagas for user and transactional state.
  - GCS: google-cloud-storage for user assets (buckets env-configured).
  - Payments: Stripe integration (stripe, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET).
  - Other: typesense, shippo, boto3 are present in dependencies for search, shipping, and object storage use cases.
- Payment saga pattern
  - Service layer implements RechargePaymentSaga and MarketplacePaymentSaga (see tests/test_payment_saga.py for behavior):
    - Atomic multi-system updates across SQL and Firestore with compensations on failure.
    - Strong idempotency via utils.payment_idempotency.PaymentIdempotencyManager to prevent duplicate processing; supports returning cached results.
    - Referral logic for recharges (bonus for user and referrer) when applicable.
- Observability
  - OpenTelemetry SDK and FastAPI instrumentation are enabled via config.instrument_app; logging is structured via config.get_logger.

Local validation flow
- Bring the API up: uvicorn main:app --reload --port 8082
- Hit docs: open http://localhost:8082/users/api/v1/docs
- Use the provided async scripts under tests/ to exercise endpoints that rely on real data (ensure .env is configured and backing services are reachable).

Notes from README.md
- The service uses environment variables loaded from .env; a .env.template and .env.sample exist. Running locally is as simple as python main.py once the env is set.

Repository cues for future agents
- If tests fail due to missing pytest, install it (pip install pytest). Some tests mock Firestore/DB and can run offline, others are client scripts and require the API running locally against your configured services.
- The service port is 8082 and the API is mounted under /users/api/v1. Many helper scripts assume that base URL.

