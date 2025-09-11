# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Chouka is a trading card game platform with gacha mechanics, supporting digital card collection, trading, and physical card shipping. The project uses a microservices architecture with multiple backend services deployed on Google Cloud Run and a Next.js frontend.

## Architecture

### Services
- **Backend Service** (port 8080): Core service handling cards, packs, fusion, achievements, marketplace, and shipping
- **User Backend Service** (port 8082): User-specific operations including accounts, payments, withdrawals, and user cards  
- **Firebase Functions**: Frontend serverless functions for web interface
- **Next.js Frontend** (`zapull-frontend/`): React-based web application

### Tech Stack
- **Backend**: Python 3.11 with FastAPI
- **Frontend**: Next.js (TypeScript/React)
- **Database**: Google Firestore (NoSQL) + PostgreSQL via Cloud SQL
- **Cloud**: Google Cloud Platform (GCP)
- **Payment**: Stripe API
- **Search**: Algolia & Typesense
- **Shipping**: Shippo API
- **Storage**: Google Cloud Storage
- **Monitoring**: OpenTelemetry

## Development Commands

### Environment Setup

**Virtual Environment with direnv**

This project uses direnv to automatically activate a Python virtual environment when you enter the project directory. All dependencies are pre-installed in `.venv/`.

```bash
# The virtual environment activates automatically via direnv when you cd into the project
# If this is your first time, allow direnv to work:
direnv allow

# Copy environment templates and edit with your specific values
cp backend/.env.template backend/.env
cp user_backend/.env.template user_backend/.env

# Edit .env files with your specific values
```

**Manual Setup (Alternative)**

If you prefer not to use direnv:

```bash
# Activate virtual environment manually
source .venv/bin/activate

# Copy environment templates
cp backend/.env.template backend/.env
cp user_backend/.env.template user_backend/.env

# Edit .env files with your specific values
```

### Local Development

**Note:** The virtual environment will be automatically activated when you enter the project directory (thanks to direnv). You'll see the activation message when you `cd` into the project.

```bash
# Backend service (port 8080)
cd backend
python main.py

# User backend service (port 8082)
cd user_backend
python main.py
# Alternative: uvicorn main:app --host 0.0.0.0 --port 8082 --reload

# Firebase functions (local emulator)
cd functions
npm run serve

# Frontend development server
cd zapull-frontend
npm run dev
```

### Testing
```bash
# Install pytest if not already installed
pip install pytest

# Run backend tests
pytest backend/tests/

# Run user backend tests  
pytest user_backend/tests/

# Run specific test file
pytest backend/tests/test_batch_add_cards.py

# Run single test case
pytest user_backend/tests/test_payment_saga.py::TestRechargePaymentSaga::test_successful_recharge_without_referral -q

# User backend also has client test scripts (requires running API on :8082)
python user_backend/tests/test_top_level.py
python user_backend/tests/test_achievements.py calculate-level <user_id>
python user_backend/tests/test_draw_cards.py <user_id> <pack_id> <collection_id> [count]
```

### Deployment
```bash
# Deploy both backend services to Cloud Run
./deploy.sh

# Deploy Firebase functions only
cd functions
npm run deploy

# Build and deploy frontend
cd zapull-frontend
npm run build
```

### Linting
```bash
# Firebase functions linting
cd functions  
npm run lint

# Backend services have no defined linting - install preferred tool if needed
```

## Key Architecture Patterns

### Service Communication
- Backend services communicate via HTTP
- User backend calls backend service for card operations
- Frontend communicates with user backend API at `/users/api/v1`

### Payment Saga Pattern
The user backend implements atomic payment processing with:
- **RechargePaymentSaga**: Handles fund deposits with referral bonuses
- **MarketplacePaymentSaga**: Processes card marketplace transactions
- Strong idempotency via `PaymentIdempotencyManager` to prevent duplicate charges
- Compensating transactions on failure across SQL and Firestore

### Authentication & Security
- Firebase Auth tokens validated in middleware
- Rate limiting in user backend for sensitive operations
- Payment idempotency middleware for transaction safety
- CORS configured for development origins

## API Structure

### Backend Service Endpoints (`localhost:8080`)
- `/cards/*` - Card management and definitions
- `/packs/*` - Pack configurations and operations  
- `/marketplace/*` - Trading functionality
- `/shipping/*` - Physical card shipping via Shippo
- `/achievements/*` - User achievement system

### User Backend Service Endpoints (`localhost:8082/users/api/v1`)
- `/accounts/*` - User account management
- `/payment/*` - Stripe payment processing  
- `/withdrawals/*` - Fund withdrawal requests
- `/user_cards/*` - User's card collection
- `/marketplace/*` - Marketplace listings and trading
- `/achievements/*` - Achievement calculations
- `/fusion/*` - Card fusion mechanics

## Database Schema

### Firestore Collections
- `cards` - Card definitions and metadata
- `packs` - Pack configurations and probabilities
- `users` - User profiles and settings
- `user_cards` - User's card inventory
- `marketplace_listings` - Active marketplace listings
- `transactions` - Payment and trade history

### PostgreSQL Tables (Cloud SQL)
- User financial data and balances
- Payment transaction records
- Withdrawal requests and processing
- Idempotency keys for payment safety

## Frontend Structure (`zapull-frontend/`)

### Key Directories
- `src/app/` - Next.js App Router pages
  - `/auth/` - Login, register, password reset
  - `/user/` - Profile, backpack, settings
  - `/shop/` - Pack purchasing
  - `/synthesis/` - Card fusion system
  - `/leaderboard/` - Rankings
- `src/components/` - Reusable UI components
- `src/services/` - API service layers
- `src/types/` - TypeScript type definitions

## Local Development Workflow

1. **Start Backend Services**:
   ```bash
   # Terminal 1: Backend service
   cd backend && python main.py
   
   # Terminal 2: User backend service  
   cd user_backend && python main.py
   ```

2. **Start Frontend**:
   ```bash
   # Terminal 3: Frontend dev server
   cd zapull-frontend && npm run dev
   ```

3. **Access Services**:
   - Backend API: `http://localhost:8080`
   - User Backend API: `http://localhost:8082/users/api/v1`
   - Frontend: `http://localhost:3000`
   - API Docs: `http://localhost:8082/users/api/v1/docs`

## Scripts and Utilities

### Administrative Scripts (`scripts/`)
- `recreate_challenger_accounts.py` - Batch user account creation
- `send_challenger_passwords.py` - Email password distribution
- `fetch_users.py` - User data extraction

### Migration Scripts (`user_backend/scripts/`)
- `create_challenger_accounts.py` - Account provisioning
- `migrate_avatars_to_r2.py` - Asset migration utilities

## Troubleshooting

### Payment Issues
1. Check Stripe webhook logs in dashboard
2. Review payment service logs in Cloud Run
3. Verify idempotency key handling in database
4. Check SQL transaction records for consistency

### Service Connectivity
1. Ensure `.env` files are properly configured
2. Verify Cloud SQL connection strings
3. Check Firestore project permissions
4. Confirm GCS bucket access

### Common Development Issues
- If pytest is missing: `pip install pytest`
- Services expect Python 3.11 (check Dockerfiles)
- User backend runs on port 8082, backend on 8080
- Firebase functions require Node.js 22
