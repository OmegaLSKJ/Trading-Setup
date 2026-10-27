import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { Timeframe } from './types';

export interface ForecastOutcome {
  instrumentKey: string;
  timeframe: Timeframe;
  predictedClose: number;
  actualClose: number;
  createdAt: number;
}

const memoryFile = path.join(process.cwd(), '.next', 'cache', 'ai-forecast-outcomes.jsonl');
const MAX_MEMORY_ROWS = 2_000;

async function readOutcomes(): Promise<ForecastOutcome[]> {
  try {
    const contents = await fs.readFile(memoryFile, 'utf8');
    return contents.split('\n').flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const row = JSON.parse(line) as ForecastOutcome;
        return Number.isFinite(row.predictedClose) && Number.isFinite(row.actualClose) ? [row] : [];
      } catch { return []; }
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function getForecastCalibration(instrumentKey: string, timeframe: Timeframe) {
  const matching = (await readOutcomes()).filter((row) => row.instrumentKey === instrumentKey && row.timeframe === timeframe).slice(-100);
  const meanError = matching.length ? matching.reduce((sum, row) => sum + row.actualClose - row.predictedClose, 0) / matching.length : 0;
  return { sampleCount: matching.length, meanError };
}

export async function recordForecastOutcome(outcome: ForecastOutcome): Promise<void> {
  await fs.mkdir(path.dirname(memoryFile), { recursive: true });
  const rows = await readOutcomes();
  const nextRows = [...rows.slice(-(MAX_MEMORY_ROWS - 1)), outcome];
  await fs.writeFile(memoryFile, `${nextRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}
