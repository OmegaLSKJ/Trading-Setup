import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as companyNews } from '../app/api/company-news/route';
import { GET as institutionalFlow } from '../app/api/institutional-flow/route';

const originalFetch = global.fetch;
const originalToken = process.env.UPSTOX_TOKEN;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.UPSTOX_TOKEN = originalToken;
  vi.restoreAllMocks();
});

describe('market intelligence routes', () => {
  it('maps provider company news to a bounded client contract', async () => {
    process.env.UPSTOX_TOKEN = 'test-token';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: {
        'NSE_EQ|INE001': [{ heading: 'Company update', summary: 'A material update.', article_link: 'https://example.com/article', published_time: 1790000000000 }],
      } }),
    } as Response);

    const response = await companyNews(new NextRequest('http://localhost/api/company-news?instrumentKeys=NSE_EQ%7CINE001'));
    expect(await response.json()).toEqual({ success: true, source: 'upstox', items: [{
      instrumentKey: 'NSE_EQ|INE001', title: 'Company update', summary: 'A material update.', url: 'https://example.com/article', published: '2026-09-21T14:13:20.000Z',
    }] });
  });

  it('maps FII and DII reported cash-market flows without inventing units', async () => {
    process.env.UPSTOX_TOKEN = 'test-token';
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ date: '2026-10-27', buy_value: 120, sell_value: 70 }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ date: '2026-10-27', net_value: -20 }] }) } as Response);

    const response = await institutionalFlow(new NextRequest('http://localhost/api/institutional-flow'));
    expect(await response.json()).toEqual({ success: true, source: 'upstox-nse-cash', flows: [
      { participant: 'FII', asOf: '2026-10-27', grossBuy: 120, grossSell: 70, net: 50 },
      { participant: 'DII', asOf: '2026-10-27', net: -20 },
    ] });
  });
});
