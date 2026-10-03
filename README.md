# Upstox Multi-Chart Market Data Dashboard

A high-performance, TradingView-style multi-chart terminal for financial markets powered by the **Upstox V3 Market Data API** and **Yahoo Finance (US Stocks)**.

Designed strictly for authentic market data visualization, multi-timeframe technical analysis, and rapid instrument charting across NSE Equities, Indices, F&O, and US Equities.

---

## System Requirements & Prerequisites

- **Node.js**: `>=22.12.0` (LTS or later)
- **Package Manager**: `npm` (v10+)
- **Operating Environment**: Local workstation or single-instance self-hosted deployment. Only single-instance deployment is supported due to process-local queues and in-memory caches.
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

## Pine Script Divergences (Custom 3-Candle Buy Strategy)

The TypeScript strategy implementation in `lib/strategy.ts` diverges intentionally from `strategies/Custom3CandleBuyStrategy.pine` in several key aspects:

1. **C2 Volume-SMA Alternative**: The TS implementation allows either reaching the day's highest volume up to C2 OR having C2 volume exceed 1.25x the 20-period volume SMA (`avgVol20 * 1.25`), whereas Pine strictly tests against `highestVolToday_c2`.
2. **Two-Bar Entry Spacing**: The TS implementation enforces `i - lastEntryIndex >= 2` to prevent rapid duplicate entries across consecutive 5-minute bars.
3. **Max-Hold Exit**: A protective 40-bar max hold exit rule closes trades after 40 bars without reaching TP or green-high exit, triggering global liquidation of open positions.
4. **No 365-Day Window**: The TS implementation runs backtesting across the complete loaded date range requested by the user, rather than restricting to `timenow - 365 days`.
5. **Indicator Rounding**: Indicator values (EMA, RSI, DPO, ADX) are rounded to 1 or 2 decimal places to match UI presentation and avoid floating-point representation anomalies.
6. **Per-Entry Take Profit**: Each position calculates its 2% TP target based on its individual entry price (`entryPrice * 1.02`), rather than the blended average position price.
7. **Daily Volume Reset Method**: Daily volume tracking is reset based on calendar date boundaries in the exchange-local timezone (`Asia/Kolkata` for Indian equities, `America/New_York` for US equities), rather than Pine's `ta.change(time("D"))`.

---

## Date Range Conventions & Process Architecture

- **Date Presets**:
  - `5D` calculates `to - 5 days`, yielding **six inclusive calendar dates**.
  - Month subtraction (`1M`, `3M`, `6M`) uses JavaScript `Date.prototype.setMonth()` rollover semantics (e.g., March 31 minus 1 month rolls over into March 2/3 depending on leap years).
- **Process-Local Architecture**:
  - In-memory request queues (`RequestQueue`), in-memory LRU candle caches, and ingress rate limiters (`allowApiRequest`) are scoped to the individual Node.js process.
  - Forwarded IP headers (`X-Forwarded-For`, `X-Real-IP`) are trusted only behind an authenticating reverse proxy that overwrites them.
  - Quota protection, concurrency throttling, and deduplication operate within the single active instance.
  - **Only single-instance deployment is supported**. Multi-instance clustering requires external shared state (e.g. Redis) for queues and rate limiters.

---

## Server Lifecycle & Security Boundaries

### 1. Server-Only Credential Boundary
- Upstox API credentials (`UPSTOX_TOKEN`) are isolated behind the `import 'server-only'` boundary (`lib/upstox-service.ts`, `lib/rate-limiter.ts`, `lib/instruments.ts`).
- Credentials are accessed exclusively via `getUpstoxToken()`. If `UPSTOX_TOKEN` is unset or contains placeholder text, the server reports `NO_TOKEN` status and suppresses authenticated Upstox requests while maintaining client safety.
- The browser never receives or handles upstream tokens.

### 2. Live Feed Streaming (`/api/live/stream`)
- **Transport**: Server-Sent Events (SSE) configured with `force-dynamic`, `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and periodic heartbeats (15s intervals).
- **Polling-Backed Provider Feed**: Real quotes are polled from Upstox/Yahoo using completion-based cycles guarded against overlapping in-flight executions.
- **Flow Control**: Monitors `controller.desiredSize` to throttle or coalesce ticks for slow downstream consumers.
- **Idempotent Cleanup**: Upstream abort controllers, polling intervals, and heartbeats are cleared upon stream cancellation or client disconnect before asynchronous execution.
- **Reverse Proxy Requirements**: When deploying behind Nginx or Cloudflare, ensure proxy buffering is disabled (`X-Accel-Buffering: no`) and upstream read timeouts are set to at least 3600s.

### 3. Date Pagination & Rate Limiting
- **Chunk Boundaries**: Historical minute candle requests are partitioned into **29 calendar dates inclusive per chunk** (28-day offset) using timezone-independent calendar arithmetic (`lib/date-utils.ts`).
- **Span Limits**: Enforces a strict 366-day limit for intraday minute spans and a 3652-day limit for daily spans.
- **Request Queue & Backoff**: Outbound Upstox requests are serialized through an in-memory `RequestQueue` with a concurrency limit of 4 and bounded capacity of 150 pending requests.
- **Jitter & Retry-After**: Network and 429 rate-limit exceptions follow exponential backoff with randomized jitter and respect upstream `Retry-After` response headers (both seconds and HTTP dates).

### 4. Instrument Master & Caching
- **Coverage**: Downloads and decompresses the complete **NSE Instrument Master** (`NSE.json.gz`) asynchronously via `zlib.gunzip` with size limits and atomic file writes.
- **Single-Flight Initialization**: Multiple concurrent searches share one initialization promise, with bounded non-blocking search fallback to seeded symbols. Stale masters (>24h) are refreshed in the background while continuing to serve current data.
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

# Vitest test suite
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
