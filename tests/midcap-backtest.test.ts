import { describe, expect, it } from 'vitest';
import { effectiveDateRange, ledgerToCsv, toLedgerRows } from '../lib/midcap-backtest';

describe('midcap backtest ledger', () => {
  const member = {
    exchange: 'NSE' as const,
    instrumentKey: 'NSE_EQ|INE000000001',
    symbol: 'TEST',
    source: 'Official constituent archive',
  };

  it('limits a run to the member’s historical membership window', () => {
    expect(effectiveDateRange({ ...member, activeFrom: '2023-04-01', activeTo: '2024-03-31' }, '2022-01-01', '2025-01-01')).toEqual({
      from: '2023-04-01',
      to: '2024-03-31',
    });
    expect(effectiveDateRange({ ...member, activeTo: '2021-12-31' }, '2022-01-01', '2025-01-01')).toBeNull();
  });

  it('keeps open trades explicitly open in the exported ledger', () => {
    const rows = toLedgerRows(member, [{
      id: 'BUY_1',
      symbol: 'TEST',
      status: 'OPEN',
      tier: '3-CANDLE',
      entryTime: 1700000000,
      entryTimeString: '2023-11-14 00:00:00',
      entryPrice: 100,
      targetPrice: 102,
      pnlPercent: 1,
      pnlAmount: 1,
      durationBars: 2,
      currencySymbol: '₹',
    }]);
    const csv = ledgerToCsv(rows);
    expect(rows[0].exchange).toBe('NSE');
    expect(csv).toContain(',OPEN,');
    expect(csv).toContain('Official constituent archive');
  });
});
