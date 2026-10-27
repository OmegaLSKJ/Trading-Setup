import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { fetchInstitutionalFlows } from '@/lib/market-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'institutional-flow', 30)) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.', flows: [] }, { status: 429 });
  }
  try {
    const flows = await fetchInstitutionalFlows();
    return NextResponse.json({ success: true, source: 'upstox-nse-cash', flows });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Institutional flows unavailable.', flows: [] }, { status: 503 });
  }
}
