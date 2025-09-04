# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chouka is a trading card game platform with gacha mechanics, supporting digital card collection, trading, and physical card shipping. The project uses a microservices architecture with two main backend services deployed on Google Cloud Run.

## Architecture

### Services
- **Backend Service** (port 8080): Core service handling cards, packs, fusion, achievements, marketplace, and shipping
- **User Backend Service** (port 8082): User-specific operations including accounts, payments, withdrawals, and user cards
- **Firebase Functions**: Frontend serverless functions for web interface

### Tech Stack
- **Backend**: Python 3.11 with FastAPI
- **Database**: Google Firestore (NoSQL) + PostgreSQL via Cloud SQL
- **Cloud**: Google Cloud Platform (GCP)
- **Payment**: Stripe API
- **Search**: Algolia
- **Shipping**: Shippo API
- **Storage**: Google Cloud Storage
- **Monitoring**: OpenTelemetry

## Development Commands

### Local Development
```bash
# Backend services
cd backend
python main.py

# User backend
cd user_backend
python main.py

# Frontend Firebase functions
cd functions
npm run serve  # Local emulator
```

### Testing
```bash
# Run tests with pytest (install if needed: pip install pytest)
pytest backend/tests/
pytest user_backend/tests/

# Run specific test file
pytest backend/tests/test_batch_add_cards.py
```

### Deployment
```bash
# Deploy both backend services to Cloud Run
./deploy.sh

# Deploy Firebase functions only
cd functions
npm run deploy
```

### Linting
```bash
# Frontend linting
cd functions
npm run lint
```

## Environment Setup

1. Copy environment template:
```bash
# For backend
cp backend/.env.template backend/.env

# For user_backend
cp user_backend/.env.template user_backend/.env
```

2. Configure required environment variables in `.env` files

## Key API Patterns

### Backend Service Endpoints
- `/cards/*` - Card management
- `/packs/*` - Pack operations
- `/marketplace/*` - Trading functionality
- `/shipping/*` - Physical card shipping
- `/achievements/*` - User achievements

### User Backend Service Endpoints
- `/accounts/*` - User account management
- `/payment/*` - Stripe payment processing
- `/withdrawals/*` - Fund withdrawals
- `/user_cards/*` - User's card collection

## Database Schema

### Firestore Collections
- `cards` - Card definitions
- `packs` - Pack configurations
- `users` - User profiles
- `user_cards` - User's card inventory
- `marketplace_listings` - Active marketplace listings
- `transactions` - Payment and trade history

### PostgreSQL Tables
- User financial data
- Transaction records
- Withdrawal requests

## Payment Integration

The user_backend service handles all Stripe operations:
- Payment intent creation
- Webhook processing
- Refund handling
- Card management

Key payment files:
- `user_backend/router/payment_router.py` - Payment API endpoints
- `user_backend/service/payment_service.py` - Payment business logic
- `user_backend/utils/payment_validation.py` - Payment validation utilities

## Development Best Practices

1. **Service Communication**: Backend services communicate via HTTP. User backend calls backend service for card operations.

2. **Error Handling**: All API endpoints return standardized error responses with proper HTTP status codes.

3. **Authentication**: Firebase Auth tokens are validated in middleware.

4. **Rate Limiting**: Implemented in user_backend middleware for sensitive operations.

5. **Idempotency**: Payment operations use idempotency keys to prevent duplicate charges.

6. **Environment Variables**: Never commit `.env` files. Use `.env.template` as reference.

## Common Tasks

### Adding a New Card Collection
1. Update card definitions in backend service
2. Run batch import scripts if needed
3. Update Algolia search index
4. Configure pack probabilities

### Implementing New Payment Features
1. Add endpoints in `user_backend/router/payment_router.py`
2. Implement business logic in `user_backend/service/payment_service.py`
3. Add webhook handlers if needed
4. Update payment validation utilities

### Debugging Payment Issues
1. Check Stripe webhook logs
2. Review payment service logs
3. Verify idempotency key handling
4. Check database transaction records