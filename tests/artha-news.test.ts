import { describe, expect, it } from 'vitest';
import { normalizeArthaNews, parseArthaRss } from '../lib/artha-news';

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

  it('maps ARTHA RSS articles into the same display contract', () => {
    const items = parseArthaRss(`<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[Nifty gains &amp; banks lead]]></title>
      <link>https://example.com/markets/nifty-gains</link>
      <description><![CDATA[<p>RBI news moved the market.</p>]]></description>
      <pubDate>Mon, 27 Oct 2026 10:30:00 +0530</pubDate>
    </item></channel></rss>`, 'Example Markets');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Nifty gains & banks lead', source: 'Example Markets' });
    expect(items[0]).toMatchObject({ category: 'markets', impact: 'high' });
    expect(items[0].published).toContain('2026-10-27');
  });

  it('removes encoded CDATA terminators left by a publisher feed', () => {
    const items = parseArthaRss('<rss><channel><item><title>Market update]]&gt; </title><link>https://example.com/update</link></item></channel></rss>', 'Example');
    expect(items[0].title).toBe('Market update');
  });
});
