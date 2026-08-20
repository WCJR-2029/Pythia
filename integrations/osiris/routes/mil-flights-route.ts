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
      // object guard (a null row must not throw), plausible coordinates only,
      // and AIRBORNE only — adsb.lol reports parked aircraft as alt_baro:'ground',
      // and tarmac rows inflating an "air posture" count is a lie (5% on live data).
      .filter((a: any) => a && typeof a === 'object'
        && typeof a.lat === 'number' && typeof a.lon === 'number'
        && Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180
        && a.alt_baro !== 'ground')
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
    // total = upstream's count (numeric or bust); returned = what survived the
    // filters above. Downstream must not mix them up.
    const body = { now: j.now,
      total: Number.isFinite(j.total) ? j.total : ac.length,
      returned: ac.length, ac };
    cache = { ts: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json(cache.body);
    return NextResponse.json({ error: String(e), ac: [] }, { status: 502 });
  }
}
