// scripts/qa/mock-supabase.mjs
//
// A small in-process stand-in for the Supabase REST / Auth / Functions
// endpoints the admin dashboard calls, driven through Playwright's request
// interception. It exists so the visual QA run can execute WITHOUT a tenant
// (no network, no credentials, no risk to live data) and produce the same
// screenshots the live run does.
//
// It implements the PostgREST subset the dashboard actually uses:
//   GET    /rest/v1/<table>?select=…&order=col.desc&limit=n&<col>=<op>.<v>
//   POST   /rest/v1/<table>            (insert; returns representation)
//   PATCH  /rest/v1/<table>?<filters>  (update)
//   DELETE /rest/v1/<table>?<filters>  (delete)
// with ops eq / neq / in / is / not.is / ilike / gt / gte / lt / lte and
// JSON-path columns (`answers->>_qa_run`). Anything else answers 200 [] so a
// missing table never crashes the page under test.

function parseFilter(key, raw) {
  // "eq.1", "in.(a,b)", "not.is.null", "ilike.*x*"
  const m = /^(not\.)?([a-z]+)\.(.*)$/s.exec(raw);
  if (!m) return null;
  const negate = !!m[1];
  const op = m[2];
  let value = m[3];
  if (op === 'in') {
    value = value.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''));
  }
  return { key, op, value, negate };
}

function readColumn(row, key) {
  const jsonPath = /^([a-z_]+)->>?([a-zA-Z0-9_]+)$/.exec(key);
  if (jsonPath) {
    const obj = row[jsonPath[1]];
    return obj && typeof obj === 'object' ? obj[jsonPath[2]] : undefined;
  }
  return row[key];
}

function matches(row, f) {
  const v = readColumn(row, f.key);
  let ok;
  switch (f.op) {
    case 'eq': ok = String(v) === String(f.value); break;
    case 'neq': ok = String(v) !== String(f.value); break;
    case 'in': ok = f.value.some(x => String(v) === String(x)); break;
    case 'is': ok = f.value === 'null' ? (v === null || v === undefined) : f.value === 'true' ? v === true : v === false; break;
    case 'ilike': {
      const re = new RegExp('^' + f.value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', 'i');
      ok = re.test(String(v ?? ''));
      break;
    }
    case 'gt': ok = String(v) > String(f.value); break;
    case 'gte': ok = String(v) >= String(f.value); break;
    case 'lt': ok = String(v) < String(f.value); break;
    case 'lte': ok = String(v) <= String(f.value); break;
    default: ok = true;
  }
  return f.negate ? !ok : ok;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

export function createMockSupabase({ tables, user, accessToken, onFunctionCall }) {
  const calls = { functions: [], rest: [] };

  const session = () => ({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh-token',
    user,
  });

  const json = (body, status = 200, extra = {}) => ({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...extra },
    body: JSON.stringify(body),
  });

  async function handle(route, request) {
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
    }

    // ── Auth ──
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname === '/auth/v1/user') return route.fulfill(json(user));
      if (url.pathname === '/auth/v1/token') return route.fulfill(json(session()));
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill(json({}));
    }

    // ── Edge functions ──
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.replace('/functions/v1/', '');
      let body = null;
      try { body = JSON.parse(request.postData() || 'null'); } catch { body = request.postData(); }
      calls.functions.push({ name, body });
      const custom = onFunctionCall?.(name, body);
      if (custom) return route.fulfill(json(custom.body, custom.status ?? 200));
      return route.fulfill(json({ ok: true }));
    }

    // ── PostgREST ──
    if (url.pathname.startsWith('/rest/v1/')) {
      const rest = url.pathname.replace('/rest/v1/', '');
      const wantsObject = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (rest.startsWith('rpc/')) {
        // The two SECURITY DEFINER lookups the dashboard uses for guest /
        // purchaser rows. Everything else answers an empty set.
        const fn = rest.slice(4);
        let params = {};
        try { params = JSON.parse(request.postData() || '{}'); } catch { params = {}; }
        const attendees = tables.attendees ?? [];
        let out = [];
        if (fn === 'get_attendee_by_id') out = attendees.filter(a => a.id === params.lookup_id);
        else if (fn === 'get_guests_by_primary') out = attendees.filter(a => a.primary_attendee_id === params.p_id);
        calls.rest.push({ method, table: `rpc/${fn}`, filters: [] });
        if (wantsObject) {
          if (out.length === 1) return route.fulfill(json(out[0]));
          return route.fulfill(json({ code: 'PGRST116', details: `${out.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406));
        }
        return route.fulfill(json(out));
      }
      const table = rest;
      const rows = tables[table] ?? (tables[table] = []);
      const filters = [];
      for (const [k, v] of url.searchParams.entries()) {
        if (RESERVED.has(k)) continue;
        const f = parseFilter(k, v);
        if (f) filters.push(f);
      }
      calls.rest.push({ method, table, filters: filters.map(f => `${f.negate ? 'not.' : ''}${f.key}.${f.op}`) });
      const select = (list) => {
        let out = list;
        const order = url.searchParams.get('order');
        if (order) {
          const [col, dir] = order.split('.');
          out = out.slice().sort((a, b) => {
            const av = readColumn(a, col), bv = readColumn(b, col);
            if (av === bv) return 0;
            const cmp = av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1 : (av < bv ? -1 : 1);
            return dir === 'desc' ? -cmp : cmp;
          });
        }
        const limit = Number(url.searchParams.get('limit') || 0);
        if (limit > 0) out = out.slice(0, limit);
        return out;
      };
      const respond = (list) => {
        if (wantsObject) {
          if (list.length === 1) return route.fulfill(json(list[0]));
          return route.fulfill(json({ code: 'PGRST116', details: `${list.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406));
        }
        return route.fulfill(json(list, 200, { 'content-range': `0-${Math.max(list.length - 1, 0)}/${list.length}` }));
      };

      if (method === 'GET' || method === 'HEAD') {
        return respond(select(rows.filter(r => filters.every(f => matches(r, f)))));
      }
      if (method === 'POST') {
        let body = [];
        try { body = JSON.parse(request.postData() || '[]'); } catch { body = []; }
        const inserted = (Array.isArray(body) ? body : [body]).map(r => ({ id: r.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
        rows.push(...inserted);
        return respond(inserted);
      }
      if (method === 'PATCH') {
        let patch = {};
        try { patch = JSON.parse(request.postData() || '{}'); } catch { patch = {}; }
        const updated = [];
        for (const r of rows) {
          if (filters.every(f => matches(r, f))) { Object.assign(r, patch); updated.push(r); }
        }
        return respond(updated);
      }
      if (method === 'DELETE') {
        const removed = rows.filter(r => filters.every(f => matches(r, f)));
        tables[table] = rows.filter(r => !removed.includes(r));
        return respond(removed);
      }
      return route.fulfill(json([]));
    }

    // Storage / anything else
    return route.fulfill(json({}));
  }

  return { handle, calls, session };
}

/** A syntactically valid (unsigned) JWT so supabase-js accepts the stored session. */
export function fakeJwt(user, ttlSeconds = 3600) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated',
    iat: now, exp: now + ttlSeconds, session_id: 'mock-session',
  })}.${b64({ sig: 'mock' })}`;
}
