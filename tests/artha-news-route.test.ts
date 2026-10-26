import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/news/route';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ARTHA news route', () => {
  it('proxies only the mapped ARTHA news contract', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{
          title: 'Sensex rises',
          snippet: 'Banks led the market.',
          link: 'https://example.com/market',
          impact: 'medium',
        }],
        internal_debug_value: 'must not be exposed',
      }),
    } as Response);

    const response = await GET(new NextRequest('http://localhost:3000/api/news'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true, source: 'artha-api',
      items: [{
        title: 'Sensex rises', summary: 'Banks led the market.', source: 'Example',
        url: 'https://example.com/market', published: '', impact: 'medium', tickers: [],
      }],
    });
  });

  it('uses ARTHA RSS when the local ARTHA API is unreachable', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('local ARTHA is unavailable'))
      .mockResolvedValue({
        ok: true,
        text: async () => '<rss><channel><item><title>Nifty update</title><link>https://example.com/nifty-update</link><description>Market update</description></item></channel></rss>',
      } as Response);

    const response = await GET(new NextRequest('http://localhost:3000/api/news'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('artha-rss');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('Nifty update');
  });
});
