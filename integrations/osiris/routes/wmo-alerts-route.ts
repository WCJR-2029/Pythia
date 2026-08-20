import { NextResponse } from 'next/server';

/**
 * OSIRIS — WMO Severe Weather Information Centre global CAP alerts (no key).
 * Official alerts from WMO member met agencies worldwide — the global
 * counterpart to the US-only NWS feed, and cover for the flaky GDACS leg.
 * We keep only Severe (s=3) and Extreme (s=4) alerts, grouped by country+event,
 * with the Extreme ones surfaced individually.
 */
export const dynamic = 'force-dynamic';

const URL = 'https://severeweather.wmo.int/json/wmo_all.json';

// ISO 3166-1 numeric -> alpha-2 (generated from /usr/share/iso-codes 2026-08-20)
const NUM2CC: Record<number, string> = {533:'AW',4:'AF',24:'AO',660:'AI',248:'AX',8:'AL',20:'AD',784:'AE',32:'AR',51:'AM',16:'AS',10:'AQ',260:'TF',28:'AG',36:'AU',40:'AT',31:'AZ',108:'BI',56:'BE',204:'BJ',535:'BQ',854:'BF',50:'BD',100:'BG',48:'BH',44:'BS',70:'BA',652:'BL',112:'BY',84:'BZ',60:'BM',68:'BO',76:'BR',52:'BB',96:'BN',64:'BT',74:'BV',72:'BW',140:'CF',124:'CA',166:'CC',756:'CH',152:'CL',156:'CN',384:'CI',120:'CM',180:'CD',178:'CG',184:'CK',170:'CO',174:'KM',132:'CV',188:'CR',192:'CU',531:'CW',162:'CX',136:'KY',196:'CY',203:'CZ',276:'DE',262:'DJ',212:'DM',208:'DK',214:'DO',12:'DZ',218:'EC',818:'EG',232:'ER',732:'EH',724:'ES',233:'EE',231:'ET',246:'FI',242:'FJ',238:'FK',250:'FR',234:'FO',583:'FM',266:'GA',826:'GB',268:'GE',831:'GG',288:'GH',292:'GI',324:'GN',312:'GP',270:'GM',624:'GW',226:'GQ',300:'GR',308:'GD',304:'GL',320:'GT',254:'GF',316:'GU',328:'GY',344:'HK',334:'HM',340:'HN',191:'HR',332:'HT',348:'HU',360:'ID',833:'IM',356:'IN',86:'IO',372:'IE',364:'IR',368:'IQ',352:'IS',376:'IL',380:'IT',388:'JM',832:'JE',400:'JO',392:'JP',398:'KZ',404:'KE',417:'KG',116:'KH',296:'KI',659:'KN',410:'KR',414:'KW',418:'LA',422:'LB',430:'LR',434:'LY',662:'LC',438:'LI',144:'LK',426:'LS',440:'LT',442:'LU',428:'LV',446:'MO',663:'MF',504:'MA',492:'MC',498:'MD',450:'MG',462:'MV',484:'MX',584:'MH',807:'MK',466:'ML',470:'MT',104:'MM',499:'ME',496:'MN',580:'MP',508:'MZ',478:'MR',500:'MS',474:'MQ',480:'MU',454:'MW',458:'MY',175:'YT',516:'NA',540:'NC',562:'NE',574:'NF',566:'NG',558:'NI',570:'NU',528:'NL',578:'NO',524:'NP',520:'NR',554:'NZ',512:'OM',586:'PK',591:'PA',612:'PN',604:'PE',608:'PH',585:'PW',598:'PG',616:'PL',630:'PR',408:'KP',620:'PT',600:'PY',275:'PS',258:'PF',634:'QA',638:'RE',642:'RO',643:'RU',646:'RW',682:'SA',729:'SD',686:'SN',702:'SG',239:'GS',654:'SH',744:'SJ',90:'SB',694:'SL',222:'SV',674:'SM',706:'SO',666:'PM',688:'RS',728:'SS',678:'ST',740:'SR',703:'SK',705:'SI',752:'SE',748:'SZ',534:'SX',690:'SC',760:'SY',796:'TC',148:'TD',768:'TG',764:'TH',762:'TJ',772:'TK',795:'TM',626:'TL',776:'TO',780:'TT',788:'TN',792:'TR',798:'TV',158:'TW',834:'TZ',800:'UG',804:'UA',581:'UM',858:'UY',840:'US',860:'UZ',336:'VA',670:'VC',862:'VE',92:'VG',850:'VI',704:'VN',548:'VU',876:'WF',882:'WS',887:'YE',710:'ZA',894:'ZM',716:'ZW'};

let cache: { ts: number; body: Record<string, unknown> } | null = null;
const TTL = 10 * 60_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) return NextResponse.json(cache.body);
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!res.ok) throw new Error(`WMO ${res.status}`);
    const j = await res.json();
    const items = (j.items || []).filter((i: any) => (i.s || 0) >= 3);
    // Country: CAP OID ids embed the ISO 3166 numeric code ("urn:oid:2.49.0.1.840..."
    // -> 840 = US); some agencies use "IN-..." ids or an "in-ndma-xx/..." url instead.
    const cc = (i: any) => {
      const id = String(i.id || '');
      const oid = id.match(/2\.49\.0\.[01]\.(\d+)/);
      if (oid) return NUM2CC[Number(oid[1])] || `#${oid[1]}`;
      const p = id.split('-')[0];
      if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
      const u = String(i.url || '').split('-')[0];
      if (/^[a-z]{2}$/.test(u)) return u.toUpperCase();
      return '??';
    };
    const groups = new Map<string, { cc: string; event: string; n: number; sMax: number }>();
    for (const i of items) {
      const key = `${cc(i)}|${i.event}`;
      const g = groups.get(key) || { cc: cc(i), event: String(i.event || ''), n: 0, sMax: 0 };
      g.n += 1;
      g.sMax = Math.max(g.sMax, i.s || 0);
      groups.set(key, g);
    }
    const extreme = items
      .filter((i: any) => i.s === 4)
      .slice(0, 20)
      .map((i: any) => ({
        cc: cc(i),
        event: String(i.event || ''),
        headline: String(i.headline || '').slice(0, 300),
        area: String(i.areaDesc || '').slice(0, 200),
        sent: i.sent,
        expires: i.expires,
      }));
    const body = {
      updated: j.lastUpdated,
      total_alerts: (j.items || []).length,
      severe: items.length,
      extreme_count: items.filter((i: any) => i.s === 4).length,
      countries: new Set(items.map(cc)).size,
      extreme,
      groups: [...groups.values()].sort((a, b) => b.sMax - a.sMax || b.n - a.n).slice(0, 40),
    };
    cache = { ts: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json(cache.body);
    return NextResponse.json({ error: String(e), groups: [], extreme: [] }, { status: 502 });
  }
}
