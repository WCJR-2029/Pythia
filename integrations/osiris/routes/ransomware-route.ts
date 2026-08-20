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
    // Leak-site text is attacker-controlled and lands in a markdown digest:
    // collapse whitespace/newlines and strip link/heading/emphasis syntax so a
    // crafted victim name can't forge structure or smuggle a clickable URL.
    const clean = (x: any, n: number) =>
      String(x || '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[\[\]()*_#`>|!]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n);
    const victims = (Array.isArray(j) ? j : [])
      .filter((v: any) => v && typeof v === 'object' && (v.victim || v.group))
      .slice(0, 40)
      .map((v: any) => ({
        victim: clean(v.victim, 120),
        group: clean(v.group, 60),
        country: clean(v.country, 2).toUpperCase(),
        sector: clean(v.activity, 80),
        discovered: v.discovered || v.attackdate || '',
        description: clean(v.description, 240),
      }));
    const body = { count: victims.length, victims };
    cache = { ts: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json(cache.body);
    return NextResponse.json({ error: String(e), victims: [] }, { status: 502 });
  }
}
