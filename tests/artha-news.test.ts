import { describe, expect, it } from 'vitest';
import { normalizeArthaNews } from '../lib/artha-news';

describe('ARTHA news mapping', () => {
  it('keeps only safe, displayable fields from ARTHA news', () => {
    const items = normalizeArthaNews({
      items: [{
        title: 'Nifty rises after RBI commentary',
        snippet: 'Banks lead the move.',
        link: 'https://www.moneycontrol.com/news/markets/example',
        published: '2026-10-27T09:30:00+05:30',
        impact: 'high',
        tickers: ['HDFCBANK', 42, 'ICICIBANK'],
      }, {
        title: 'Unsafe link',
        link: 'javascript:alert(1)',
      }],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: 'Moneycontrol', impact: 'high', tickers: ['HDFCBANK', 'ICICIBANK'] });
    expect(items[1].url).toBe('');
  });

  it('drops malformed items without a headline', () => {
    expect(normalizeArthaNews({ items: [{ link: 'https://example.com' }, null] })).toEqual([]);
  });
});
