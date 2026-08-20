import { NextResponse } from 'next/server';

/**
 * OSIRIS — ransomware victimology via ransomware.live v2 (no key, free
 * non-commercial). Recent claimed victims with group, sector, and country —
 * the actor/victim layer that complements KEV (which vulns) and IOC blocklists
 * (which infrastructure). Victim descriptions are untrusted leak-site text:
 * truncated hard, displayed only, never interpreted.
 */
export const dynamic = 'force-dynamic';

const URL = 'https://api.ransomware.live/v2/recentvictims';

let cache: { ts: number; body: Record<string, unknown> } | null = null;
const TTL = 30 * 60_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) return NextResponse.json(cache.body);
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!res.ok) throw new Error(`ransomware.live ${res.status}`);
    const j = await res.json();
    const victims = (Array.isArray(j) ? j : [])
      .slice(0, 40)
      .map((v: any) => ({
        victim: String(v.victim || '').slice(0, 120),
        group: String(v.group || '').slice(0, 60),
        country: String(v.country || '').slice(0, 2).toUpperCase(),
        sector: String(v.activity || '').slice(0, 80),
        discovered: v.discovered || v.attackdate || '',
        description: String(v.description || '').slice(0, 240),
      }));
    const body = { count: victims.length, victims };
    cache = { ts: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json(cache.body);
    return NextResponse.json({ error: String(e), victims: [] }, { status: 502 });
  }
}
