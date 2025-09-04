# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Overview
- Framework: Next.js 15 (App Router) with React 19 and TypeScript
- Styling: Tailwind CSS (tailwind-scrollbar plugin)
- State: Zustand
- E2E testing: Playwright
- Payments/SDKs: Stripe, Firebase
- Path aliases: @/* -> src/* (tsconfig.json)

Common commands
- Install deps: npm install
- Development server (Turbopack): npm run dev
  - Starts Next.js dev server on port 3000 by default.
- Build:
  - Production: npm run build
  - Fast (skip typecheck and lint via next.config.ts): npm run build:no-typecheck or npm run build:fast
  - Test-mode builds (used for export/static or test start):
    - npm run build:test
    - npm run build:test-export (next build --no-lint && next export)
- Start server:
  - Default: npm start
  - Test mode (sets NODE_ENV=test): npm run start:test
- Lint: npm run lint
- E2E tests (Playwright):
  - Run locally against dev server: PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --reporter=list
    - Shortcut scripts:
      - npm run test:repro (list reporter)
      - npm run test:repro:html (HTML report in playwright-report)
  - Run a single spec: PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/path/to/spec.spec.ts
  - Run a single test by title: PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test -g "test title substring"
  - Headed mode for debugging: PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --headed --debug
  - Update screenshots/snapshots if used: npx playwright test -u

Testing workflow
- Preferred: run the dev server in one terminal (npm run dev) and run Playwright in another with PLAYWRIGHT_BASE_URL=http://localhost:3000.
- Alternate (static export for test): npm run build:test-export then serve the out/ directory with any static server and set PLAYWRIGHT_BASE_URL to that URL.
- Config: see playwright.config.ts (testDir=./tests, multi-project: Desktop Chrome, Mobile Safari; traces on-first-retry; videos on; screenshots on failure).

Architecture and project layout
- Top-level Next.js app using the App Router under src/app. Key sections (from README.md):
  - app/page.tsx (home), detail/[id]/page.tsx
  - app/auth/* (login, register, forgot-password)
  - app/synthesis, app/shop, app/points, app/leaderboard, app/purchase
  - app/user/* (profile, backpack, promotion, settings)
  - app/mail, app/info/* (about, terms, privacy)
- Shared code lives under src/components (ui, layout, features), src/lib (utilities), src/hooks (custom hooks), src/context (React contexts), src/services (API layer), src/styles (global styles), src/types (TypeScript types).
- TypeScript configuration (tsconfig.json):
  - strict true, noEmit, moduleResolution bundler, JSX preserve, path alias @/* to src/*.
- Styling:
  - Tailwind configured via tailwind.config.ts with content scanning paths for src/pages, src/components, src/app; postcss.config.mjs loads tailwindcss.
- Images and environments (next.config.ts):
  - ESLint and TypeScript errors are ignored during builds (ignoreDuringBuilds, ignoreBuildErrors) to keep CI/builds unblocked; rely on npm run lint locally.
  - images.domains allows Google Cloud Storage and several zapull.fun buckets (including -dev variants). In NODE_ENV=test, images are unoptimized.
  - For NODE_ENV=test: output 'export' (static export), trailingSlash true, basePath/assetPrefix blank. For NODE_ENV=production: output 'standalone'.

Conventions and notes
- Use the @/* alias for imports from src to avoid long relative paths.
- Because builds ignore type and lint errors by config, always run npm run lint locally and fix issues before committing.
- When adding new pages or routes, place them in src/app using Next.js App Router conventions; co-locate page.tsx, loading.tsx, error.tsx, and route handlers where appropriate.

Cross-referenced files
- package.json: scripts for dev/build/lint/test and dependencies.
- next.config.ts: environment-dependent output, image domains, and build-time lint/TS behavior.
- tsconfig.json: TypeScript strict settings and path aliases.
- tailwind.config.ts and postcss.config.mjs: Tailwind and PostCSS setup.
- README.md: concise directory overview of src/app and feature areas (in Chinese).
- playwright.config.ts: e2e test settings.

