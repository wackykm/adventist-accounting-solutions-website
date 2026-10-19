// Ledge data layer.
// graphStore: signs in with Microsoft Entra (MSAL) and reads/writes the school's SharePoint
//   site through Microsoft Graph AS THE SIGNED-IN PERSON. SharePoint permissions decide what
//   each person can see, so one school can never read another school's site.
// demoStore: same interface, sample data in memory, nothing saved.

// SharePoint lists Ledge uses. t = single line text, m = multi-line text, n = number, b = yes/no.
// Every list also has the built-in Title column.
export const SCHEMA = {
  Submissions: { Ref: 't', Kind: 't', Amount: 'n', Received: 't', Lines: 'm', BinId: 'n', Status: 't', Note: 'm', Files: 'm', SubmittedBy: 't', Journal: 't', CheckNo: 't', CashCount: 'm' },
  Posted:      { Ref: 't', Kind: 't', Amount: 'n', Received: 't', Lines: 'm', BinId: 'n', Status: 't', Note: 'm', Files: 'm', SubmittedBy: 't', Journal: 't', CheckNo: 't', CashCount: 'm' },
  Bins:        { BinNo: 'n', SchoolYear: 't', Status: 't', Opened: 't', Closed: 't', FactsTotal: 'n', Journal: 't', DepositFile: 'm' },
  Requests:    { Kind: 't', Repeats: 't', Due: 't', Status: 't', Details: 'm', Ref: 't', AnsweredWith: 't', AppliedInFacts: 'b' },
  Messages:    { Ref: 't', Body: 'm', Who: 't', Author: 't' },
  Categories:  { Needs: 't', Active: 'b', Sort: 'n' },
  Students:    { Active: 'b', AasiSub: 'n', FactsId: 't', FactsId2: 't', Status: 't' },
  Activity:    { Ref: 't', Who: 't', Detail: 'm' },
  // StoreUp only: AASI coding behind each category (Title = category name).
  // Break permission inheritance on this list so school staff can't open it (README step 5).
  Coding:      { Account: 'n', SubMode: 't', Sub: 'n', Function: 't', Restriction: 't', Prefix: 't' }
};
// Lists every school user needs. Coding is optional and only visible to StoreUp.
export const REQUIRED = Object.keys(SCHEMA).filter(n => n !== 'Coding');

// Starter category set for SVA (from the business office review, Oct 2026).
// [name, what the form asks for, AASI coding or null]. Blank coding = still to confirm;
// the AASI upload refuses to build until a used category has full coding.
const S1 = { Account: 134100, SubMode: 'student', Function: '0000', Restriction: '0A' };
export const SVA_SET = [
  ['Student payment', 'student', { ...S1, Prefix: '' }],
  ['Application fee', 'desc', { Account: 673175, SubMode: 'fixed', Sub: 713, Function: '1240', Restriction: '2', Prefix: 'App Fee' }],
  ['Church 2-Way check', 'desc', { Account: 138220, SubMode: 'fixed', Prefix: 'Church' }],
  ['Capital gift · Ballfield Lights', 'donor', { SubMode: 'fixed', Sub: 0, Function: '912280', Prefix: 'Gift' }],
  ['Capital gift · Phase 2 Master Plan', 'donor', { SubMode: 'fixed', Sub: 0, Function: '912281', Prefix: 'Gift' }],
  ['Capital gift · Capital Repairs', 'donor', { SubMode: 'fixed', Sub: 0, Function: '912286', Prefix: 'Gift' }],
  ['General donation', 'donor', { Account: 638100, SubMode: 'fixed', Sub: 0, Prefix: 'Gift' }],
  ['Conference subsidy / DEA', 'desc', { SubMode: 'fixed', Prefix: 'Conf' }],
  ['Outside scholarship (GHRoW etc.)', 'student', { ...S1, Prefix: 'Schol' }],
  ['Summer ministry wages', 'student', { ...S1, Prefix: 'Summer' }],
  ['Rental income', 'desc', { SubMode: 'fixed', Function: '427192', Prefix: 'Rent' }],
  ['Club or trust deposit', 'desc', { SubMode: 'fixed', Prefix: 'Club' }],
  ['Unidentified receipt', 'desc', { SubMode: 'fixed', Prefix: 'Unident' }]
];

const G = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['User.Read', 'Sites.ReadWrite.All'];
const MANAGE = ['Sites.Manage.All'];

function pick(id, fields, name) {
  const out = { id: String(id), Title: fields.Title || '' };
  for (const k of Object.keys(SCHEMA[name] || {})) out[k] = fields[k];
  return out;
}
function clean(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = v;
  return out;
}
function colDef(name, t) {
  if (t === 'm') return { name, text: { allowMultipleLines: true, textType: 'plain' } };
  if (t === 'n') return { name, number: {} };
  if (t === 'b') return { name, boolean: {} };
  return { name, text: {} };
}

export function createStore(cfg) {
  const demo = !cfg.clientId || cfg.clientId.startsWith('YOUR');
  return demo ? demoStore(cfg) : graphStore(cfg);
}

/* ---------------- Microsoft Graph + SharePoint ---------------- */
function graphStore(cfg) {
  const pca = new msal.PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
      redirectUri: location.origin + location.pathname
    },
    cache: { cacheLocation: 'sessionStorage' }   // cleared when the tab closes
  });
  let siteId = null, listIds = {}, driveId = null;

  async function token(scopes = SCOPES) {
    const account = pca.getActiveAccount();
    try {
      return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
    } catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError) {
        await pca.acquireTokenRedirect({ scopes, account });
        return new Promise(() => {});   // page is navigating away
      }
      throw e;
    }
  }

  async function g(path, { method = 'GET', body, scopes, raw } = {}) {
    const headers = { Authorization: 'Bearer ' + await token(scopes) };
    let payload = body;
    if (body && !(body instanceof Blob)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(path.startsWith('https://') ? path : G + path, { method, headers, body: payload });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error.message; } catch {}
      const e = new Error(msg); e.status = r.status; throw e;
    }
    if (raw || r.status === 204) return r;
    return r.json();
  }

  return {
    demo: false,
    me: null,
    ready: false,

    async start() {
      const res = await pca.handleRedirectPromise();
      if (res) pca.setActiveAccount(res.account);
      const a = pca.getActiveAccount() || pca.getAllAccounts()[0];
      if (!a) { await pca.loginRedirect({ scopes: SCOPES }); return false; }
      pca.setActiveAccount(a);
      const email = (a.username || '').toLowerCase();
      this.me = { name: a.name || email, email, isStoreUp: cfg.storeUpDomains.some(d => email.endsWith('@' + d)) };
      return true;
    },

    // Schools this person can open. A 403/404 from SharePoint means "not yours", so it is hidden.
    async schools() {
      const found = await Promise.all(cfg.schools.map(async s => {
        try { const site = await g(`/sites/${s.siteHost}:${s.sitePath}`); return { ...s, siteId: site.id }; }
        catch { return null; }
      }));
      return found.filter(Boolean);
    },

    async use(school) {
      siteId = school.siteId; listIds = {}; driveId = null;
      const ls = await g(`/sites/${siteId}/lists?$select=id,displayName&$top=200`);
      ls.value.forEach(l => { listIds[l.displayName] = l.id; });
      if (listIds.Scans) driveId = (await g(`/sites/${siteId}/lists/${listIds.Scans}/drive?$select=id`)).id;
      this.ready = REQUIRED.every(n => listIds[n]) && !!driveId;
      this.hasCoding = !!listIds.Coding;
    },

    async list(name) {
      if (!listIds[name]) return [];
      const out = [];
      let url = `/sites/${siteId}/lists/${listIds[name]}/items?expand=fields&$top=999`;
      while (url) {
        const r = await g(url);
        r.value.forEach(i => out.push(pick(i.id, i.fields, name)));
        url = r['@odata.nextLink'];
      }
      return out;
    },
    async create(name, fields) {
      const r = await g(`/sites/${siteId}/lists/${listIds[name]}/items`, { method: 'POST', body: { fields: clean(fields) } });
      return pick(r.id, r.fields, name);
    },
    async update(name, id, fields) {
      await g(`/sites/${siteId}/lists/${listIds[name]}/items/${id}/fields`, { method: 'PATCH', body: clean(fields) });
    },
    async remove(name, id) {
      await g(`/sites/${siteId}/lists/${listIds[name]}/items/${id}`, { method: 'DELETE', raw: true });
    },

    // Files go to the school's "Scans" library, never anywhere else.
    async upload(file, folder, name) {
      const path = `${folder}/${name}`.split('/').map(encodeURIComponent).join('/');
      if (file.size < 4 * 1024 * 1024) {
        const r = await g(`/drives/${driveId}/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', body: file });
        return { id: r.id, name: r.name };
      }
      const sess = await g(`/drives/${driveId}/root:/${path}:/createUploadSession`, { method: 'POST', body: { item: { '@microsoft.graph.conflictBehavior': 'rename' } } });
      const CHUNK = 320 * 1024 * 16;
      let r;
      for (let i = 0; i < file.size; i += CHUNK) {
        const end = Math.min(i + CHUNK, file.size);
        r = await fetch(sess.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${i}-${end - 1}/${file.size}` }, body: file.slice(i, end) });
        if (!r.ok) throw new Error('The upload stopped partway. Try again.');
      }
      const j = await r.json();
      return { id: j.id, name: j.name };
    },
    async download(id) {
      const m = await g(`/drives/${driveId}/items/${id}`);
      const r = await fetch(m['@microsoft.graph.downloadUrl']);
      return { blob: await r.blob(), name: m.name, type: m.file?.mimeType || '' };
    },

    // StoreUp only: creates any missing lists and the Scans library on the school's site.
    async provision() {
      for (const [name, cols] of Object.entries(SCHEMA)) {
        if (listIds[name]) {
          // Existing list: add any columns a newer version of Ledge needs.
          const have = new Set((await g(`/sites/${siteId}/lists/${listIds[name]}/columns?$select=name&$top=200`)).value.map(c => c.name));
          for (const [c, t] of Object.entries(cols)) if (!have.has(c))
            await g(`/sites/${siteId}/lists/${listIds[name]}/columns`, { method: 'POST', scopes: MANAGE, body: colDef(c, t) });
          continue;
        }
        const r = await g(`/sites/${siteId}/lists`, { method: 'POST', scopes: MANAGE, body: {
          displayName: name, columns: Object.entries(cols).map(([c, t]) => colDef(c, t)), list: { template: 'genericList' } } });
        listIds[name] = r.id;
      }
      if (!listIds.Scans) {
        const r = await g(`/sites/${siteId}/lists`, { method: 'POST', scopes: MANAGE, body: { displayName: 'Scans', list: { template: 'documentLibrary' } } });
        listIds.Scans = r.id;
      }
      driveId = (await g(`/sites/${siteId}/lists/${listIds.Scans}/drive?$select=id`)).id;
      this.ready = true; this.hasCoding = true;
    },

    signOut() { sessionStorage.clear(); pca.logoutRedirect(); }
  };
}

/* ---------------- Demo (sample data, in memory) ---------------- */
function demoStore(cfg) {
  let nextId = 100;
  const files = new Map();
  const L = (o) => JSON.stringify(o);
  const db = {
    Categories: SVA_SET.map(([Title, Needs], i) => ({ id: String(i + 1), Title, Needs, Active: true, Sort: i })),
    Coding: SVA_SET.filter(x => x[2]).map(([Title, , c], i) => ({ id: String(200 + i), Title, ...c })),
    Students: [['Ava Thompson', 8601, 'F1021'], ['Elias Moreno', 8602, 'F1022'], ['Grace Kim', 8603, 'F1023'], ['Jonah Whitfield', 8604, 'F1024'],
      ['Lucía Herrera', 8605, 'F1025'], ['Marcus Bell', 8606, 'F1026'], ['Naomi Osei', 8607, 'F1027'], ['Samuel Park', null, 'F1028']]
      .map(([Title, AasiSub, FactsId], i) => ({ id: String(20 + i), Title, AasiSub, FactsId, Status: 'Current', Active: true })),
    Bins: [
      { id: '41', Title: 'Current bin', BinNo: 15, SchoolYear: '26-27', Status: 'Open', Opened: '2026-10-14' },
      { id: '40', Title: 'Deposit Oct 13', BinNo: 14, SchoolYear: '26-27', Status: 'Posted', Opened: '2026-10-07', Closed: '2026-10-13', FactsTotal: 3410, Journal: 'JE-26-1042' },
      { id: '39', Title: 'Deposit Oct 6', BinNo: 13, SchoolYear: '26-27', Status: 'Deposited', Opened: '2026-09-30', Closed: '2026-10-06', FactsTotal: 5125, Journal: 'JE-26-1019' },
      { id: '38', Title: 'Deposit Sep 29', BinNo: 12, SchoolYear: '26-27', Status: 'Reconciled', Opened: '2026-09-23', Closed: '2026-09-29', Journal: 'JE-26-0987' }
    ],
    Submissions: [
      { id: '61', Ref: 'RC-0061', Title: 'Thompson family', Kind: 'Check', Received: '2026-10-16', BinId: 41, Status: 'Submitted', CheckNo: '4471', Amount: 1250, Lines: L([{ cat: 'Student payment', who: 'Ava Thompson', amt: 1250 }]), SubmittedBy: 'Student accounts' },
      { id: '60', Ref: 'RC-0060', Title: 'Spirit club bake sale', Kind: 'Cash', Received: '2026-10-16', BinId: 41, Status: 'Submitted', Amount: 186.5, Lines: L([{ cat: 'Club or trust deposit', who: 'Spirit club bake sale', amt: 186.5 }]), SubmittedBy: 'Student accounts' },
      { id: '59', Ref: 'RC-0059', Title: 'Harold & June Pierce', Kind: 'Check', Received: '2026-10-15', BinId: 41, Status: 'Submitted', CheckNo: '1188', Amount: 500, Lines: L([{ cat: 'Capital gift · Ballfield Lights', who: 'Harold & June Pierce', amt: 500 }]), SubmittedBy: 'Student accounts' },
      { id: '58', Ref: 'RC-0058', Title: 'Moreno, R.', Kind: 'Wire', Received: '2026-10-15', Status: 'Needs info', Amount: 4800, Lines: L([{ cat: 'Student payment', who: '', amt: 4800 }]), Note: 'Which student? Two Moreno students are enrolled.', SubmittedBy: 'Student accounts' }
    ],
    Posted: [
      { id: '57', Ref: 'RC-0057', Title: 'Kim family', Kind: 'Check', Received: '2026-10-10', BinId: 40, Status: 'Posted', Journal: 'JE-26-1042', Amount: 2200, Lines: L([{ cat: 'Student payment', who: 'Grace Kim', amt: 2200 }]), SubmittedBy: 'Student accounts' },
      { id: '56', Ref: 'RC-0056', Title: 'New Market SDA Church', Kind: 'Check', Received: '2026-10-09', BinId: 40, Status: 'Posted', Journal: 'JE-26-1042', Amount: 1210, Lines: L([{ cat: 'General donation', who: 'New Market SDA Church', amt: 750 }, { cat: 'Student payment', who: 'Naomi Osei', amt: 460 }]), SubmittedBy: 'Student accounts' },
      { id: '55', Ref: 'RC-0055', Title: 'Whitfield, D.', Kind: 'ACH', Received: '2026-10-08', Status: 'Posted', Journal: 'JE-26-1036', Amount: 3100, Lines: L([{ cat: 'Student payment', who: 'Jonah Whitfield', amt: 3100 }]), SubmittedBy: 'Student accounts' },
      { id: '54', Ref: 'RC-0054', Title: 'Bell family', Kind: 'Check', Received: '2026-10-02', BinId: 39, Status: 'Posted', Journal: 'JE-26-1019', Amount: 1675, Lines: L([{ cat: 'Student payment', who: 'Marcus Bell', amt: 1675 }]), SubmittedBy: 'Student accounts' },
      { id: '53', Ref: 'RC-0053', Title: 'Lena Ortiz', Kind: 'Check', Received: '2026-10-01', BinId: 39, Status: 'Posted', Journal: 'JE-26-1019', Amount: 3450, Lines: L([{ cat: 'Capital gift · Capital Repairs', who: 'Lena Ortiz', amt: 3450 }]), SubmittedBy: 'Student accounts' }
    ],
    Requests: [
      { id: '83', Title: '$2,500.00 wire on Oct 9 with no submission', Kind: 'Missing backup', Due: '2026-10-20', Status: 'Open', Details: 'The bank shows an incoming wire from HERRERA FAM TR. Upload the confirmation and say what it is for.' },
      { id: '82', Title: 'FACTS deposit file', Kind: 'FACTS deposit', Repeats: 'Weekly', Due: '2026-10-19', Status: 'Open', Details: 'Upload the finished FACTS-to-AASI deposit .xlsx as-is.' },
      { id: '84', Title: 'ASP deposit', Kind: 'ASP deposit', Repeats: 'Every 2 weeks', Due: '2026-10-24', Status: 'Open', AppliedInFacts: false, Details: 'Upload the ASP deposit report. Tick “Applied in FACTS” once the payments are applied to family accounts.' },
      { id: '81', Title: 'Change to RC-0054', Kind: 'Change request', Due: '2026-10-17', Status: 'Open', Ref: 'RC-0054', Details: 'One check covers two cousins. Split it: $1,000 Marcus Bell, $675 Samuel Park.' }
    ],
    Messages: [
      { id: '91', Ref: 'RC-0058', Who: 'StoreUp', Author: 'Kevin', Body: 'Which student is this wire for? Two Moreno students are on file.' },
      { id: '92', Ref: 'RC-0054', Who: 'School', Author: 'Juanita', Body: 'One check covers two cousins. Can we split it?' },
      { id: '93', Ref: 'RC-0054', Who: 'StoreUp', Author: 'Kevin', Body: 'Yes. It is already posted, so we will book a correcting entry.' }
    ],
    Activity: []
  };
  const copy = o => JSON.parse(JSON.stringify(o));
  return {
    demo: true,
    ready: true,
    hasCoding: true,
    me: { name: 'Juanita (demo)', email: 'juanita@school.example', isStoreUp: false },
    async start() { return true; },
    async schools() { return [cfg.schools[0]]; },
    async use() {},
    async list(name) { return copy(db[name] || []); },
    async create(name, fields) { const it = { id: String(++nextId), ...clean(fields) }; db[name].unshift(it); return copy(it); },
    async update(name, id, fields) { const it = db[name].find(x => x.id === String(id)); Object.assign(it, fields); },
    async remove(name, id) { db[name] = db[name].filter(x => x.id !== String(id)); },
    async upload(file) { const id = 'f' + (++nextId); files.set(id, file); return { id, name: file.name }; },
    async download(id) { const f = files.get(id); if (!f) throw new Error('Sample items have no scan attached. Upload one with Submit to try this.'); return { blob: f, name: f.name, type: f.type }; },
    async provision() {},
    signOut() { location.reload(); }
  };
}
