import { NextResponse } from 'next/server';

/**
 * OSIRIS — live military aircraft worldwide via adsb.lol /v2/mil (no key, ODbL).
 * Community ADS-B: every airborne military-flagged aircraft with a position.
 * Sanitized to the fields the engine needs; positions are a posture signal
 * (surges, unusual concentrations), not a tracking product.
 */
export const dynamic = 'force-dynamic';

const URL = 'https://api.adsb.lol/v2/mil';

let cache: { ts: number; body: Record<string, unknown> } | null = null;
const TTL = 2 * 60_000;   // near-real-time; engine polls on its own cycle anyway

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) return NextResponse.json(cache.body);
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
    const j = await res.json();
    const ac = (j.ac || [])
      .filter((a: any) => typeof a.lat === 'number' && typeof a.lon === 'number')
      .slice(0, 600)
      .map((a: any) => ({
        hex: a.hex,
        flight: String(a.flight || '').trim(),
        reg: a.r || '',
        type: a.t || '',
        lat: a.lat,
        lon: a.lon,
        alt: typeof a.alt_baro === 'number' ? a.alt_baro : null,
        gs: a.gs ?? null,
      }));
    const body = { now: j.now, total: j.total ?? ac.length, ac };
    cache = { ts: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json(cache.body);
    return NextResponse.json({ error: String(e), ac: [] }, { status: 502 });
  }
}
