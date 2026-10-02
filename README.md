# Upstox Multi-Chart Market Data Dashboard

A high-performance, TradingView-style multi-chart terminal for Indian financial markets powered by the **Upstox V3 Market Data API**. 

Designed strictly for market data visualization, multi-timeframe technical analysis, and rapid instrument charting across NSE Equities, Indices, F&O, BSE, and MCX.

---

## Key Features

- **Multi-Chart Grid Layouts**: 1 Chart, 2 Charts (Horizontal / Vertical), 4-Chart Grid (2×2), 6-Chart Grid, and 8-Chart Grid.
- **Upstox V3 Direct Feed**: Direct server-side streaming of historical candles and intraday candles with zero token leakage to the client.
- **Instrument Master & Instant Search**: Pre-seeded with top NSE symbols (NIFTY 50, BANK NIFTY, RELIANCE, TCS, HDFCBANK, INFY, etc.) and backed by automated background caching of all 74,000+ Indian instruments from Upstox master files.
- **Multi-Timeframe Controls**: Independent timeframe selection per chart (`1m`, `3m`, `5m`, `10m`, `15m`, `30m`, `1h`, `1D`) with optional global timeframe synchronization.
- **Date Range Presets & Auto-Pagination**: Presets for `Today`, `5D`, `1M`, `3M`, `6M`, `YTD`, `1Y`, and `Custom`. Automatically splits multi-month minute candle queries into valid Upstox date chunks, deduplicating and sorting chronologically.
- **Volume & Technical Indicators**:
  - Volume histogram bars colored by price direction
  - Exponential Moving Averages: EMA 8, EMA 16, EMA 20, EMA 50, EMA 200
  - Relative Strength Index: RSI 14
  - Volume Weighted Average Price: VWAP (resets daily)
- **Multi-Chart Synchronization**:
  - Sync Crosshair across all open charts
  - Sync Visible Time Range & Zoom
  - Sync Timeframe across all charts
- **Watchlist & Layout Persistence**:
  - Left collapsible watchlist sidebar with quick symbol switching
  - Named layout manager (e.g. "Banking", "Index Monitor") persisted in browser `localStorage`
  - Restores your exact workspace configuration on restart
- **Connection Status HUD**: Live connection indicator displaying server ping latency, status, and indexed instrument counts.

---

## Security Architecture

> [!IMPORTANT]
> **Zero Client-Side Token Exposure**:
> - The Upstox token is read **only on the server** via `process.env.UPSTOX_TOKEN`.
> - It is **never** prefixed with `NEXT_PUBLIC_`.
> - It is **never** printed to console logs or exposed via any API endpoint.
> - The client browser only communicates with your secure local proxy routes (`/api/candles`, `/api/instruments/search`, `/api/health`).

---

## Getting Started

### Prerequisites

- Node.js v18+ (tested on Node v20/v26)
- npm or pnpm

### Installation

1. Clone or open the project folder:
   ```bash
   cd "Trading Setup"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your Upstox Analytics Token:
   Create or edit `.env.local` in the project root:
   ```env
   # Upstox Analytics / Access Token (Server-side ONLY)
   UPSTOX_TOKEN=YOUR_UPSTOX_ANALYTICS_TOKEN
   ```
   *(Note: The dashboard also connects to Upstox's public market data endpoints even if a token is not yet configured, allowing you to test charts right away).*

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## How It Works

### 1. Instrument Resolution & Search
- On server startup, the system indexes popular Indian equities and indices instantly.
- In the background, it downloads and caches `https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz`.
- When searching (press `/` or click "Search Instrument"), query strings like `RELIANCE`, `TCS`, `INFY` are resolved into formal Upstox instrument keys (`NSE_EQ|INE002A01018`, `NSE_INDEX|Nifty 50`).

### 2. Historical & Intraday Candles
- **Historical API**: Calls `/v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}/{from_date}`.
- **Intraday API**: Calls `/v3/historical-candle/intraday/{instrument_key}/{unit}/{interval}` for current trading day data.
- **Normalization**: Candles are normalized to `{ time, open, high, low, close, volume, openInterest }`, mapped to IST timezone (`Asia/Kolkata`), sorted oldest-to-newest, and deduplicated.

### 3. Date-Range Pagination & Rate Limiting
- Upstox restricts minute-level historical data to ~30 days per request.
- The `upstox-service` automatically breaks large date spans (e.g. 1 year of 5-minute data) into sequential 28-day chunks.
- Requests pass through an in-memory concurrency queue (`upstoxRequestQueue`) with rate limiting and exponential backoff retry.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` or `Ctrl + K` / `Cmd + K` | Open Instrument Search |
| `↑` / `↓` | Navigate Search Results |
| `Enter` | Select Instrument |
| `Esc` | Close Dialog |

---

## Troubleshooting

- **Rate Limits (HTTP 429)**: The server automatically throttles and retries with backoff. If you encounter rate limits on extensive history, increase spacing in `lib/rate-limiter.ts`.
- **Port Conflict**: By default, Next.js starts on `3000`. You can start on another port with `npx next dev -p 3001`.
- **Token Verification**: Check the top-right status badge or open the Settings modal to see ping latency and token authorization status.
