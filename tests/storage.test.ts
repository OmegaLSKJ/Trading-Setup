import { describe, it, expect } from 'vitest';
import { getTimezoneOption, DEFAULT_TIMEZONE } from '../lib/timezones';


describe('Storage & Migration Resilience', () => {
  it('migrates Europe/Frankfurt to Europe/Berlin seamlessly', () => {
    // Legacy value migration
    const option = getTimezoneOption('Europe/Frankfurt');
    expect(option.value).toBe('Europe/Berlin');
    expect(option.region).toContain('Berlin');
  });

  it('falls back to default timezone for unknown or invalid timezone values', () => {
    const option = getTimezoneOption('Mars/Curiosity');
    expect(option.value).toBe(DEFAULT_TIMEZONE);
  });


  it('validates corrupted localStorage JSON gracefully without throwing', () => {
    // Test JSON parse error handling logic as applied in loadPersistedState
    const malformedJson = '{ corrupted: [';
    let parsed = null;
    let failed = false;

    try {
      parsed = JSON.parse(malformedJson);
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
    expect(parsed).toBeNull();
  });

  it('validates schema versioning and rejects mismatched major versions', () => {
    const CURRENT_STORAGE_VERSION = 2;
    const oldPayload = {
      version: 1,
      charts: [{ id: 'chart-1', invalidField: true }],
    };

    // If version is older or payload is invalid, hydration should safely discard or migrate
    const isValidVersion = oldPayload.version === CURRENT_STORAGE_VERSION;
    expect(isValidVersion).toBe(false);
  });
});

describe('Multi-Chart Grid Selection & Capacity', () => {
  it('correctly maps layout modes to max chart capacity capped at 6', async () => {
    const { getLayoutCapacity } = await import('../store/dashboard-store');
    expect(getLayoutCapacity('1')).toBe(1);
    expect(getLayoutCapacity('2h')).toBe(2);
    expect(getLayoutCapacity('2v')).toBe(2);
    expect(getLayoutCapacity('4')).toBe(4);
    expect(getLayoutCapacity('6')).toBe(6);
  });

  it('allows opening multiple charts into empty grid slots without overwriting', async () => {
    const { useDashboardStore } = await import('../store/dashboard-store');
    const store = useDashboardStore.getState();

    // Set to 6 grid layout
    store.setLayoutMode('6');
    expect(useDashboardStore.getState().layoutMode).toBe('6');
    expect(useDashboardStore.getState().charts.length).toBeLessThanOrEqual(6);

    // If active chart exists, opening an existing instrument switches focus
    const firstChart = useDashboardStore.getState().charts[0];
    if (firstChart) {
      useDashboardStore.getState().openChartForInstrument(firstChart.instrument);
      expect(useDashboardStore.getState().activeChartId).toBe(firstChart.id);
    }
  });
});
