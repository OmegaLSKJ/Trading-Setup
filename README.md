# Upstox Multi-Chart Market Data Dashboard

A high-performance, TradingView-style multi-chart terminal for financial markets powered by the **Upstox V3 Market Data API** and **Yahoo Finance (US Stocks)**.

Designed strictly for authentic market data visualization, multi-timeframe technical analysis, and rapid instrument charting across NSE Equities, Indices, F&O, and US Equities.

---

## System Requirements & Prerequisites

- **Node.js**: `>=20.9.0` (tested on Node v20 LTS and Node v26)
- **Package Manager**: `npm` (v10+)
- **Operating Environment**: Local workstation or single-user self-hosted deployment.
- **File System**: Writable `.next/cache` and local storage directory for instrument gzip caching and Next.js build artifacts.

---

## Architectural Principles & Data Truthfulness

> [!IMPORTANT]
> **Zero Fabricated Data Guarantee**:
> - **No Synthetic Ticks**: All price and volume movements come directly from authentic Upstox or Yahoo Finance quotes. When markets are closed or quotes are stagnant, charts remain strictly static.
> - **Truthful Volume**: Volume deltas are derived directly from provider cumulative volume (`cumulativeVolume - lastCumulativeVolume`) without artificial fallbacks.
> - **Truthful Statistics**: Strategy win rates represent real closed trades with `pnl > 0`. When no closed trades exist, win rate displays as `N/A`. Break-even trades (`pnl = 0`) are treated as non-winning closed trades.
> - **Error Transparency**: Upstream network, authentication, and rate-limit errors are propagated to the UI. If a date chunk fails, partial ranges are displayed with clear notices rather than silently masked.

---

## Server Lifecycle & Security Boundaries

### 1. Server-Only Credential Boundary
- Upstox API credentials (`UPSTOX_TOKEN`) are isolated behind the `import 'server-only'` boundary (`lib/upstox-service.ts`, `lib/rate-limiter.ts`, `lib/instruments.ts`).
- Credentials are accessed exclusively via `getUpstoxToken()`. If `UPSTOX_TOKEN` is unset or contains placeholder text, the server reports `NO_TOKEN` status and suppresses authenticated Upstox requests while maintaining client safety.
- The browser never receives or handles upstream tokens.

### 2. Live Feed Streaming (`/api/live/stream`)
- **Transport**: Server-Sent Events (SSE) configured with `force-dynamic` and periodic heartbeats (15s intervals).
- **Polling-Backed Provider Feed**: Real quotes are polled from Upstox/Yahoo using completion-based cycles guarded against overlapping in-flight executions.
- **Flow Control**: Monitors `controller.desiredSize` to throttle or coalesce ticks for slow downstream consumers.
- **Idempotent Cleanup**: Upstream abort controllers, polling intervals, and heartbeats are cleared upon stream cancellation or client disconnect before asynchronous execution.
- **Reverse Proxy Requirements**: When deploying behind Nginx or Cloudflare, ensure proxy buffering is disabled (`X-Accel-Buffering: no`) and upstream read timeouts are set to at least 3600s.

### 3. Date Pagination & Rate Limiting
- **Chunk Boundaries**: Historical minute candle requests are partitioned into **29 calendar dates inclusive per chunk** (28-day offset) using timezone-independent calendar arithmetic (`lib/date-utils.ts`).
- **Span Limits**: Enforces a strict 366-day limit for intraday minute spans to prevent memory exhaustion.
- **Request Queue & Linear Backoff**: Outbound Upstox requests are serialized through an in-memory `RequestQueue` with a concurrency limit of 1 and bounded capacity of 150 pending requests.
- **Jitter & Retry-After**: Network and 429 rate-limit exceptions follow linear backoff with randomized jitter (50–250ms) and respect upstream `Retry-After` response headers.

### 4. Instrument Master & Caching
- **Coverage**: Downloads and decompresses the complete **NSE Instrument Master** (`NSE.json.gz`) asynchronously via `zlib.gunzip` and atomic file writes.
- **Single-Flight Initialization**: Multiple concurrent searches share one initialization promise, with bounded non-blocking search fallback to seeded symbols.
- **In-Memory Cache**: Candle responses are cached using an in-memory LRU cache bounded to 200 entries. **Only complete, successful responses are cached**; partial or failed ranges are never cached.

---

## Deployment & Single-User Boundary

- **Authentication**: This terminal is intentionally unauthenticated and designed for **single-user or localhost operation**. Do not expose the service directly to untrusted public networks without an authenticating reverse proxy (e.g. Tailscale, Cloudflare Access, or HTTP Basic Auth).
- **Simulation Mode**: There is **no simulation mode**. Charts reflect live market ticks or closed-market states as delivered by upstream exchanges.

---

## Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
Create `.env.local` in the project root:
```env
# Upstox V3 Market Data Access Token (Server-side ONLY)
UPSTOX_TOKEN=your_actual_upstox_access_token_here
```

### 3. Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Verification Baseline

Verify code quality, type correctness, unit tests, and production build:

```bash
# Type checking with non-incremental compiler verification
npm run typecheck

# Code linting
npm run lint

# Vitest test suite (23 deterministic unit tests)
npm test

# Production build bundle validation
npm run build
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` or `Ctrl + K` / `Cmd + K` | Open Instrument Search (modal-safe) |
| `↑` / `↓` | Navigate Search Results |
| `Enter` / `Space` | Select Instrument / Navigate to Trade |
| `Esc` | Close Active Modal Dialog |
