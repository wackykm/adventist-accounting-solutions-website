import { createStore, SVA_SET } from './store.js';

const cfg = window.LEDGE_CONFIG;
const store = createStore(cfg);
const $ = s => document.querySelector(s);

/* ---------- helpers ---------- */
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const D = s => s ? new Date(s + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
const schoolYear = s => { const d = new Date(s + 'T12:00'), y = d.getFullYear() % 100, p = n => String(n).padStart(2, '0'); return d.getMonth() >= 6 ? `${p(y)}-${p(y + 1)}` : `${p(y - 1)}-${p(y)}`; };
const parse = (j, d) => { try { return JSON.parse(j || '') ?? d; } catch { return d; } };
const linesOf = s => parse(s.Lines, []);
const filesOf = s => parse(s.Files, []);
const safeName = t => String(t).replace(/[\\/:*?"<>|#%]+/g, '-').slice(0, 80);
const round2 = n => Math.round(n * 100) / 100;

const LISTS = () => ['Submissions', 'Posted', 'Bins', 'Requests', 'Messages', 'Categories', 'Students', ...(su() ? ['Coding'] : [])];
const DENOMS = [100, 50, 20, 10, 5, 2, 1];
const S = { schools: [], school: null, data: { Coding: [] }, tab: 'home', filter: 'All', drawer: null, answering: null, lines: [], busy: false };
const su = () => store.me.isStoreUp;
if (store.demo) window.__ledge = S;

const statusChip = { 'Submitted': 'c-info', 'Needs info': 'c-bad', 'Ready': 'c-warn', 'Posted': 'c-good', 'Change requested': 'c-warn',
  'Open': 'c-info', 'Closed': 'c-warn', 'Verified': 'c-warn', 'Deposited': 'c-good', 'Reconciled': 'c-mute', 'Answered': 'c-good' };
const chip = s => `<span class="chip ${statusChip[s] || 'c-mute'}">${esc(s)}</span>`;
const BIN_STEPS = ['Open', 'Closed', 'Posted', 'Verified', 'Deposited', 'Reconciled'];

function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 3200); }

/* ---------- data views ---------- */
const subs = () => [...S.data.Submissions, ...S.data.Posted].sort((a, b) => (b.Received || '').localeCompare(a.Received || '') || Number(b.id) - Number(a.id));
const openChange = ref => S.data.Requests.find(r => r.Kind === 'Change request' && r.Ref === ref && r.Status !== 'Closed');
const statusOf = s => s._list === 'Posted' ? (openChange(s.Ref) ? 'Change requested' : 'Posted') : s.Status;
const bins = () => [...S.data.Bins].sort((a, b) => (b.SchoolYear || '').localeCompare(a.SchoolYear || '') || b.BinNo - a.BinNo);
const openBin = () => S.data.Bins.find(b => b.Status === 'Open');
const binItems = b => subs().filter(s => String(s.BinId) === String(b.id));
const binTotal = b => round2(binItems(b).reduce((a, s) => a + (Number(s.Amount) || 0), 0));
const binName = b => b.Status === 'Open' ? 'Current bin' : `Deposit ${D(b.Closed)}`;
const binNo = b => `${b.SchoolYear} · ${String(b.BinNo).padStart(2, '0')}`;
const binRef = id => { const b = S.data.Bins.find(x => String(x.id) === String(id)); return b ? binName(b) : ''; };
const cats = () => S.data.Categories.filter(c => c.Active !== false).sort((a, b) => (a.Sort ?? 99) - (b.Sort ?? 99));
const students = () => S.data.Students.filter(s => s.Active !== false).sort((a, b) => a.Title.localeCompare(b.Title));
const studentByName = n => S.data.Students.find(s => s.Title === n);
const codingFor = cat => S.data.Coding.find(c => c.Title === cat);
const codingComplete = c => !!(c && c.Account && c.Function && c.Restriction && (c.SubMode === 'student' || c.Sub != null));
const mdy = s => { const d = new Date(s + 'T12:00'); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const findRef = ref => subs().find(s => s.Ref === ref) || S.data.Requests.find(r => r.id === ref);

async function load() {
  const names = LISTS();
  const res = await Promise.all(names.map(l => store.list(l)));
  names.forEach((l, i) => { S.data[l] = res[i]; });
  if (!su()) S.data.Coding = [];
  S.data.Submissions.forEach(x => x._list = 'Submissions');
  S.data.Posted.forEach(x => x._list = 'Posted');
}
const log = (Title, Ref = '', Detail = '') => store.create('Activity', { Title, Ref, Who: store.me.name, Detail }).catch(() => {});
const say = (Ref, Body) => store.create('Messages', { Title: Ref, Ref, Body, Who: su() ? 'StoreUp' : 'School', Author: store.me.name });

/* ---------- shell ---------- */
const TABS = () => [['home', 'Home'], ...(su() ? [] : [['submit', 'Submit']]), ['history', 'History'], ['bins', 'Bins'], ['req', 'Requests'], ['msg', 'Messages'], ...(su() ? [['setup', 'Setup']] : [])];
function counts() {
  return {
    home: S.data.Requests.filter(r => r.Status === 'Open' && (su() ? r.Kind === 'Change request' : r.Kind !== 'Change request')).length + S.data.Submissions.filter(s => s.Status === (su() ? 'Submitted' : 'Needs info')).length,
    bins: S.data.Bins.filter(b => (su() ? ['Closed', 'Deposited'] : ['Posted', 'Verified']).includes(b.Status)).length,
    req: S.data.Requests.filter(r => r.Status === 'Open').length
  };
}
function renderShell() {
  const sc = S.school;
  $('#school').innerHTML = `<b>${esc(sc.name)}</b>${esc(sc.place || '')}` + (S.schools.length > 1
    ? `<select id="school-pick" aria-label="School">${S.schools.map(s => `<option value="${esc(s.id)}" ${s.id === sc.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : '');
  const c = counts();
  $('#nav').innerHTML = TABS().map(([k, l]) => `<button data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${l}${c[k] ? `<span class="count">${c[k]}</span>` : ''}</button>`).join('');
  $('#me').innerHTML = (store.demo ? `<div class="demo">Demo mode. Sample data, nothing is saved.</div>
    <div class="role" style="padding:0"><div class="seg" role="group" aria-label="Viewing as"><button data-role="school" aria-pressed="${!su()}">School</button><button data-role="su" aria-pressed="${su()}">StoreUp</button></div></div>` : '')
    + `<b>${esc(store.me.name)}</b><span>${su() ? 'StoreUp' : esc(sc.name)}</span><button data-act="signout">Sign out</button>`;
}
function render() {
  renderShell();
  const v = $('#view');
  v.classList.toggle('narrow', S.tab === 'submit');
  if (!store.ready && S.tab !== 'setup') S.tab = su() ? 'setup' : 'home';
  if (!store.ready && !su()) { v.innerHTML = `<div class="panel empty">StoreUp is still setting up Ledge for ${esc(S.school.name)}. Check back soon.</div>`; return; }
  v.innerHTML = ({ home: vHome, submit: vSubmit, history: vHistory, bins: vBins, req: vReq, msg: vMsg, setup: vSetup })[S.tab]();
  if (S.tab === 'submit') wireForm();
  renderDrawer();
}

/* ---------- screens ---------- */
function vHome() {
  const ob = openBin();
  const needs = su()
    ? [...S.data.Submissions.filter(s => ['Submitted', 'Ready'].includes(s.Status) && !s.BinId).map(s => ({ k: s.Ref, t: `${s.Kind} from ${s.Title}`, m: `${fmt(s.Amount)} · post it`, tag: s.Status })),
       ...S.data.Bins.filter(b => ['Closed', 'Deposited'].includes(b.Status)).map(b => ({ tab: 'bins', t: binName(b), m: b.Status === 'Closed' ? 'Ready to post' : 'Deposited, waiting to clear', tag: b.Status })),
       ...S.data.Requests.filter(r => r.Status !== 'Closed' && (r.Kind === 'Change request' || r.Status === 'Answered')).map(r => ({ k: r.id, t: r.Title, m: r.Kind, tag: r.Status }))]
    : [...S.data.Submissions.filter(s => s.Status === 'Needs info').map(s => ({ k: s.Ref, t: `${s.Kind} from ${s.Title}`, m: s.Note, tag: 'Needs info' })),
       ...S.data.Bins.filter(b => ['Posted', 'Verified'].includes(b.Status)).map(b => ({ tab: 'bins', t: binName(b), m: b.Status === 'Posted' ? 'Check the journal against the bag' : 'Ready to deposit', tag: b.Status })),
       ...S.data.Requests.filter(r => r.Status === 'Open' && r.Kind !== 'Change request').map(r => ({ k: r.id, t: r.Title, m: `Due ${D(r.Due)}`, tag: 'Open' }))];
  const month = today().slice(0, 7);
  const received = subs().filter(s => (s.Received || '').startsWith(month)).reduce((a, s) => a + (Number(s.Amount) || 0), 0);
  const first = store.me.name.split(/[\s(]/)[0];
  return `<div class="head"><div><h1>${su() ? `${esc(S.school.name)} queue` : `Hello, ${esc(first)}`}</h1>
    <p class="sub">${su() ? 'What the school has sent, and what is ready to post.' : 'What StoreUp is waiting on, and where the current deposit stands.'}</p></div>
    ${su() ? '' : '<button class="btn primary" data-tab="submit">Submit a receipt</button>'}</div>
  <div class="stats">
    <div class="panel stat"><div class="n">Current bin</div><div class="v">${ob ? fmt(binTotal(ob)) : '—'}</div></div>
    <div class="panel stat"><div class="n">${su() ? 'Waiting on StoreUp' : 'Waiting on you'}</div><div class="v">${needs.length}</div></div>
    <div class="panel stat"><div class="n">Received this month</div><div class="v">${fmt(received)}</div></div>
  </div>
  <div class="grid2">
    <section class="panel"><div class="ph"><h2>${su() ? 'To do' : 'Needs your attention'}</h2></div>
      <div class="list">${needs.length ? needs.map(n => `<div class="row" ${n.k ? `data-open="${esc(n.k)}"` : `data-tab="${n.tab}"`}><div><div class="t">${esc(n.t)}</div><div class="m">${esc(n.m || '')}</div></div><div>${chip(n.tag)}</div></div>`).join('') : '<div class="empty">Nothing waiting.</div>'}</div></section>
    <section class="panel">${ob ? `<div class="ph"><h2>Current bin <span class="lock">since ${D(ob.Opened)}</span></h2><button class="btn ghost" data-tab="bins">Go to deposit →</button></div>
      <div class="list">${binItems(ob).map(s => `<div class="row" data-open="${esc(s.Ref)}"><div><div class="t">${esc(s.Title)}</div><div class="m">${esc(s.Kind)} · ${esc(linesOf(s)[0]?.cat || '')}</div></div><div class="amt">${fmt(s.Amount)}</div></div>`).join('') || '<div class="empty">Empty so far.</div>'}</div>`
      : `<div class="empty">No open bin.${su() ? ' Start one in Setup.' : ''}</div>`}</section>
  </div>
  <section class="panel"><div class="ph"><h2>Recent</h2><button class="btn ghost" data-tab="history">All submissions →</button></div>
    <div class="tablewrap">${table(subs().slice(0, 6))}</div></section>`;
}

function table(rows) {
  if (!rows.length) return '<div class="empty">No submissions yet.</div>';
  return `<table><thead><tr><th>Receipt</th><th>From</th><th>Type</th><th>For</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>
  ${rows.map(s => `<tr data-open="${esc(s.Ref)}"><td style="font-weight:500">${esc(s.Ref)}<div class="lock">${D(s.Received)}</div></td><td>${esc(s.Title)}</td>
  <td>${esc(s.Kind)}${s.BinId ? `<div class="lock">${esc(binRef(s.BinId))}</div>` : ''}</td>
  <td>${linesOf(s).map(l => `${esc(l.cat)}${l.who ? `<div class="lock">${esc(l.who)}</div>` : ''}`).join('')}</td><td class="amt">${fmt(s.Amount)}</td><td>${chip(statusOf(s))}</td></tr>`).join('')}</tbody></table>`;
}

function vHistory() {
  const fs = ['All', 'Submitted', 'Needs info', 'Posted', 'Change requested'];
  const rows = S.filter === 'All' ? subs() : subs().filter(s => statusOf(s) === S.filter);
  return `<div class="head"><div><h1>History</h1><p class="sub">Every receipt sent to StoreUp. Posted items are locked; request a change instead.</p></div>
  <div class="filters">${fs.map(f => `<button data-filter="${f}" aria-pressed="${S.filter === f}">${f}</button>`).join('')}</div></div>
  <section class="panel tablewrap">${rows.length ? table(rows) : '<div class="empty">No submissions with this status.</div>'}</section>`;
}

function vBins() {
  return `<div class="head"><div><h1>Bins</h1><p class="sub">One bin per bank deposit. Close it on deposit day; StoreUp posts one journal for it, dated the day it closed.</p></div></div>
  ${S.data.Bins.length ? `<div class="bins">${bins().map(binCard).join('')}</div>` : `<div class="panel empty">No bins yet.${su() ? ' Start the first one in Setup.' : ''}</div>`}`;
}
function binCard(b) {
  const t = binTotal(b), items = binItems(b), i = BIN_STEPS.indexOf(b.Status);
  const diff = b.FactsTotal != null ? round2(t - Number(b.FactsTotal)) : null;
  const tools = su() && b.Status !== 'Open' ? `<button class="btn" data-act="aasi" data-bin="${b.id}">AASI upload</button><button class="btn" data-act="csv" data-bin="${b.id}">Lines (CSV)</button><button class="btn" data-act="pdf" data-bin="${b.id}">Backup PDF</button>` : '';
  let acts = '';
  if (b.Status === 'Open' && !su()) acts = S.confirmBin === b.id
    ? `<div class="confirm"><b>Close this bin for today’s deposit?</b>Nothing else can be added. Enter the FACTS check and cash receipts total for the same days.
       <label>FACTS receipts total<input id="facts" inputmode="decimal" placeholder="${t.toFixed(2)}"></label>
       <div class="inline"><button class="btn primary" data-act="close" data-bin="${b.id}">Close bin</button><button class="btn" data-act="cancel">Keep open</button></div></div>`
    : `<button class="btn primary" data-act="ask" data-bin="${b.id}" ${items.length ? '' : 'disabled'}>Close for deposit</button><span class="lock">${items.length} items</span>`;
  if (b.Status === 'Open' && su()) acts = '<span class="lock">The school closes this on deposit day.</span>';
  if (b.Status === 'Closed') acts = su() ? `<div class="inline"><input id="je-${b.id}" placeholder="AASI journal #" aria-label="Journal number"><button class="btn primary" data-act="post" data-bin="${b.id}">Mark posted</button></div>${tools}` : '<span class="lock">StoreUp is posting this bin.</span>';
  if (b.Status === 'Posted') acts = su() ? `<span class="lock">Waiting on the school to verify.</span>${tools}` : `<button class="btn primary" data-act="verify" data-bin="${b.id}">Journal matches the bag</button>`;
  if (b.Status === 'Verified') acts = su() ? `<span class="lock">Waiting on the deposit.</span>${tools}` : `<label class="btn primary" style="cursor:pointer">Upload deposit receipt<input type="file" hidden data-act="deposit" data-bin="${b.id}" accept="image/*,application/pdf"></label>`;
  if (b.Status === 'Deposited') acts = su() ? `<button class="btn primary" data-act="clear" data-bin="${b.id}">Mark cleared bank</button>${tools}` : '<span class="lock">Waiting for the deposit to clear.</span>';
  if (b.Status === 'Reconciled') acts = `<span class="lock">Ledge, ledger and bank agree.</span>${tools}`;
  const dep = parse(b.DepositFile, null);
  return `<article class="panel bin"><div class="top"><div><div class="name">${esc(binName(b))}</div><div class="lock" style="margin-bottom:6px">${esc(binNo(b))}${b.Status === 'Open' ? ` · since ${D(b.Opened)}` : ''}</div>${chip(b.Status)}</div><div class="total">${fmt(t)}</div></div>
  <div class="steps" aria-label="Step ${i + 1} of 6: ${b.Status}">${BIN_STEPS.map((s, k) => `<span class="${k <= i ? 'on' : ''}" title="${s}"></span>`).join('')}</div>
  <div class="checks">
    <span>Items</span><span class="amt">${items.length}</span>
    ${b.Journal ? `<span>Journal</span><span class="amt">${esc(b.Journal)}</span>` : ''}
    ${b.FactsTotal != null ? `<span>FACTS receipts</span><span class="amt">${fmt(b.FactsTotal)}</span><span>Matches FACTS?</span><span class="match ${diff === 0 ? 'ok' : 'off'} amt">${diff === 0 ? '✓ Yes' : `${fmt(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'}`}</span>` : ''}
    ${dep ? `<span>Deposit receipt</span><span style="text-align:right"><button class="btn ghost" data-act="view" data-file="${esc(dep.id)}">View</button></span>` : ''}
  </div><div class="acts">${acts}</div></article>`;
}

function vReq() {
  const rows = [...S.data.Requests].sort((a, b) => (a.Status === 'Closed') - (b.Status === 'Closed') || (a.Due || '').localeCompare(b.Due || ''));
  return `<div class="head"><div><h1>Requests</h1><p class="sub">${su() ? 'What you have asked the school for, plus change requests from the school. Recurring requests reopen on schedule when you close them.' : 'What StoreUp needs from you. Answer by uploading the item.'}</p></div>
  ${su() ? '<button class="btn primary" data-act="newreq-open">New request</button>' : ''}</div>
  ${S.newReq ? `<form class="panel setup" id="rf" style="padding-top:18px"><div class="pair"><div class="f"><label for="rq-t">What do you need?</label><input id="rq-t" placeholder="Bank statement for October"></div>
    <div class="f"><label for="rq-d">Due</label><input id="rq-d" type="date" value="${today()}"></div></div>
    <div class="pair"><div class="f"><label for="rq-k">Kind</label><select id="rq-k"><option>Missing backup</option><option>FACTS deposit</option><option>ASP deposit</option><option>Square deposit</option><option>Question</option></select></div>
    <div class="f"><label for="rq-r">Repeats</label><select id="rq-r"><option value="">One time</option><option>Weekly</option><option>Every 2 weeks</option><option>Monthly</option></select></div></div>
    <div class="f"><label for="rq-x">Details</label><textarea id="rq-x" rows="2"></textarea></div>
    <div class="inline"><button class="btn primary" data-act="newreq">Send to school</button><button class="btn" type="button" data-act="newreq-cancel">Cancel</button></div></form>` : ''}
  <section class="panel list">${rows.length ? rows.map(r => `<div class="row" data-open="${esc(r.id)}"><div><div class="t">${esc(r.Title)}</div><div class="m">${esc(r.Kind)}${r.Repeats ? ` · repeats ${esc(r.Repeats.toLowerCase())}` : ''}${r.Due ? ` · due ${D(r.Due)}` : ''}${r.Kind === 'ASP deposit' ? (r.AppliedInFacts ? ' · applied in FACTS ✓' : ' · not yet applied in FACTS') : ''}</div></div><div>${chip(r.Status)}</div></div>`).join('') : '<div class="empty">No requests.</div>'}</section>`;
}

function vMsg() {
  const groups = {};
  S.data.Messages.forEach(m => (groups[m.Ref] = groups[m.Ref] || []).push(m));
  const keys = Object.keys(groups).sort((a, b) => Math.max(...groups[b].map(m => +m.id)) - Math.max(...groups[a].map(m => +m.id)));
  return `<div class="head"><div><h1>Messages</h1><p class="sub">Every conversation stays attached to the receipt or request it is about.</p></div></div>
  <section class="panel list">${keys.length ? keys.map(k => {
    const ms = groups[k].sort((a, b) => +a.id - +b.id), last = ms[ms.length - 1], ref = findRef(k);
    const label = ref ? (ref.Ref ? `${ref.Ref} · ${ref.Title}` : ref.Title) : k;
    return `<div class="row" data-open="${esc(k)}"><div><div class="t">${esc(label)}</div><div class="m">${esc(last.Author || last.Who)}: ${esc(last.Body)}</div></div><div class="lock">${ms.length}</div></div>`;
  }).join('') : '<div class="empty">No messages yet.</div>'}</section>`;
}

function vSetup() {
  const codingRows = cats().map(c => {
    const k = codingFor(c.Title) || {}, ok = codingComplete(k);
    return `<tr><td>${esc(c.Title)}<div class="lock">${esc(c.Needs || 'nothing else')}</div></td>
      <td><input data-cod="Account" data-cat="${esc(c.Title)}" value="${esc(k.Account ?? '')}" placeholder="134100" inputmode="numeric" aria-label="Account"></td>
      <td><input data-cod="Sub" data-cat="${esc(c.Title)}" value="${esc(k.SubMode === 'student' ? 'student' : (k.Sub ?? ''))}" placeholder="student or 713" aria-label="Subaccount"></td>
      <td><input data-cod="Function" data-cat="${esc(c.Title)}" value="${esc(k.Function ?? '')}" placeholder="0000" aria-label="Function"></td>
      <td><input data-cod="Restriction" data-cat="${esc(c.Title)}" value="${esc(k.Restriction ?? '')}" placeholder="0A" aria-label="Restriction"></td>
      <td><input data-cod="Prefix" data-cat="${esc(c.Title)}" value="${esc(k.Prefix ?? '')}" placeholder="Gift" aria-label="Description prefix"></td>
      <td>${chip(ok ? 'Ready' : 'Open')}</td><td><button class="btn" data-act="coding-save" data-cat="${esc(c.Title)}">Save</button></td></tr>`;
  }).join('');
  const nst = students(), missing = nst.filter(x => x.AasiSub == null).length;
  return `<div class="head"><div><h1>Setup</h1><p class="sub">StoreUp only. Lists, categories, AASI coding and students for ${esc(S.school.name)}.</p></div></div>
  <section class="panel"><div class="ph"><h2>SharePoint lists</h2>${chip(store.ready && store.hasCoding ? 'Ready' : 'Open')}</div>
    <div class="setup">${store.ready && store.hasCoding ? '<p class="lock" style="margin:0">All lists and the Scans library exist. Run the update after a new version of Ledge adds columns.</p><div><button class="btn" data-act="provision">Update lists</button></div>'
      : `<p style="margin:0">Creates or updates the Ledge lists and the Scans library on <code>${esc(S.school.siteHost + S.school.sitePath)}</code>, including the StoreUp-only Coding list. Microsoft may ask you to approve site management the first time.</p>
         <div><button class="btn primary" data-act="provision">${store.ready ? 'Update lists' : 'Create Ledge lists'}</button></div>`}</div></section>
  ${store.ready ? `
  <section class="panel"><div class="ph"><h2>First bin</h2></div><div class="setup">${S.data.Bins.length ? '<p class="lock" style="margin:0">Bins are running. New ones open automatically when the school closes one.</p>' : '<div><button class="btn primary" data-act="firstbin">Open the first bin</button></div>'}</div></section>
  <section class="panel"><div class="ph"><h2>Categories the school picks from</h2></div><div class="setup">
    <div class="tags">${cats().map(c => `<span class="tag">${esc(c.Title)}${c.Needs ? ` <span class="lock">· ${esc(c.Needs)}</span>` : ''}<button data-act="cat-off" data-id="${c.id}" aria-label="Remove ${esc(c.Title)}">×</button></span>`).join('') || '<span class="lock">None yet.</span>'}</div>
    <div class="inline"><input id="cat-name" placeholder="Club or trust deposit · SA"><select id="cat-needs" style="max-width:190px"><option value="">Nothing else</option><option value="student">Needs a student</option><option value="donor">Needs donor name</option><option value="desc">Needs a description</option></select><button class="btn" data-act="cat-add">Add</button></div>
    <div><button class="btn" data-act="cat-sva">Replace with the SVA set</button></div>
    <p class="lock" style="margin:0">The school only sees these names. The coding below stays on StoreUp’s side.</p></div></section>
  <section class="panel"><div class="ph"><h2>AASI coding</h2><span class="m">${cats().filter(c => codingComplete(codingFor(c.Title))).length} of ${cats().length} ready</span></div>
    <div class="setup"><p class="lock" style="margin:0">Subaccount: type <b>student</b> to use the student’s AASI number, or a fixed number. Function and restriction are written to AASI as text. The AASI upload won’t build until every category used in a bin is ready.</p></div>
    <div class="tablewrap"><table><thead><tr><th>Category</th><th>Account</th><th>Sub</th><th>Function</th><th>Restr.</th><th>Prefix</th><th></th><th></th></tr></thead><tbody>${codingRows}</tbody></table></div></section>
  <section class="panel"><div class="ph"><h2>Students</h2><span class="m">${nst.length} active${missing ? ` · ${missing} without an AASI #` : ''}</span></div><div class="setup">
    <div class="f"><label for="stu">Paste from the master database: name, AASI subaccount, FACTS ID, FACTS ID 2. One student per line, tab or comma separated. Only these four columns.</label><textarea id="stu" rows="5" placeholder="Ava Thompson	8601	F1021&#10;Samuel Park		F1028"></textarea></div>
    <div class="inline"><select id="stu-status" style="max-width:240px"><option>Current</option><option>Prior year</option></select><button class="btn" data-act="stu-add">Add or update students</button><button class="btn" data-act="stu-clear">Mark all inactive (new school year)</button></div>
    <p class="lock" style="margin:0">Students without an AASI number post to 134100 / 0 with their last name and a RECLASS flag. Use “Prior year” for graduated students with work shortages.</p></div></section>
  <section class="panel"><div class="ph"><h2>Recurring deposits</h2></div><div class="setup">
    <p class="lock" style="margin:0">FACTS, ASP and Square come in as recurring requests, each posted as its own journal.</p>
    <div><button class="btn" data-act="recurring-defaults">Add FACTS, ASP and Square requests</button></div></div></section>` : ''}`;
}

/* ---------- submit ---------- */
function vSubmit() {
  const ob = openBin(), req = S.answering && S.data.Requests.find(r => r.id === S.answering);
  return `<div class="head"><div><h1>Submit a receipt</h1><p class="sub">Say what it’s for once. StoreUp takes it from there.</p></div></div>
  ${req ? `<div class="banner">Answering: ${esc(req.Title)}</div>` : ''}
  <form class="panel sub" id="sf" novalidate>
    <div class="f"><span class="lbl">What came in?</span><div class="types">${['Check', 'Cash', 'Wire', 'ACH', 'Export'].map((t, i) => `<label><input type="radio" name="type" value="${t}" ${(req ? t === (/deposit|export/i.test(req.Kind) ? 'Export' : 'Wire') : i === 0) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
    <div class="f"><label class="drop" id="drop" for="file">Drop scans or tap to choose<input id="file" type="file" accept="image/*,application/pdf,.csv,.xlsx" multiple hidden></label></div>
    <div class="pair"><div class="f"><label for="payer">From</label><input id="payer" placeholder="Herrera family" autocomplete="off"></div>
    <div class="f"><label for="date">Received</label><input id="date" type="date" value="${today()}"></div></div>
    <div class="f" id="ckf"><label for="checkno">Check number</label><input id="checkno" inputmode="numeric" placeholder="4471" style="max-width:200px"></div>
    <div class="f" id="cashf"><span class="lbl">Cash count</span><div class="denoms">${DENOMS.map(d => `<label>$${d}<input data-den="${d}" inputmode="numeric" placeholder="0"></label>`).join('')}<label>Coins $<input id="coins" inputmode="decimal" placeholder="0.00"></label></div>
      <div class="pair"><input id="by1" placeholder="Counted by"><input id="by2" placeholder="Second counter"></div><span class="hint" id="cashtot">Counted $0.00</span></div>
    <div class="f" id="forf"><span class="lbl">What is it for?</span><div class="lines" id="lines"></div><div><button type="button" class="btn ghost" id="addline">+ Split it</button></div></div>
    <div class="f" id="binf"><label for="bin">Bin</label><select id="bin">${ob ? `<option value="${ob.id}">Current bin (since ${D(ob.Opened)})</option>` : '<option value="">No open bin</option>'}</select><span class="hint">Enter it in FACTS first, then drop the check in the bag.</span></div>
    <div class="foot"><span class="balance" id="bal">$0.00</span><button class="btn primary" type="submit">Submit</button></div>
  </form>`;
}
function wireForm() {
  const f = $('#sf');
  S.lines = [{ cat: cats()[0]?.Title || '', who: '', amt: '' }];
  drawLines(); syncType();
  f.addEventListener('input', e => {
    const i = e.target.dataset.i;
    if (i != null) {
      const l = S.lines[i]; l[e.target.dataset.k] = e.target.value;
      if (e.target.dataset.k === 'cat') { l.who = ''; l.sub = null; drawLines(); return; }
      if (e.target.dataset.k === 'who' && e.target.tagName === 'SELECT') l.sub = studentByName(l.who)?.AasiSub ?? null;
    }
    if (e.target.dataset.den != null || e.target.id === 'coins') $('#cashtot').textContent = `Counted ${fmt(cashCount().total)}`;
    $('#bal').textContent = fmt(S.lines.reduce((a, l) => a + (parseFloat(l.amt) || 0), 0));
  });
  f.addEventListener('change', e => {
    if (e.target.name === 'type') syncType();
    if (e.target.id === 'file') { const d = $('#drop'), n = e.target.files.length; d.classList.toggle('has', n > 0); d.firstChild.textContent = n ? [...e.target.files].map(x => x.name).join(', ') : 'Drop scans or tap to choose'; }
  });
  f.addEventListener('click', e => {
    if (e.target.id === 'addline') { S.lines.push({ cat: cats()[0]?.Title || '', who: '', amt: '' }); drawLines(); }
    if (e.target.dataset.x != null) { S.lines.splice(+e.target.dataset.x, 1); drawLines(); }
  });
  const drop = $('#drop');
  drop.addEventListener('dragover', e => e.preventDefault());
  drop.addEventListener('drop', e => { e.preventDefault(); $('#file').files = e.dataTransfer.files; $('#file').dispatchEvent(new Event('change', { bubbles: true })); });
  f.addEventListener('submit', e => { e.preventDefault(); run(submit); });
}
function cashCount() {
  const dens = {}; let total = 0;
  document.querySelectorAll('[data-den]').forEach(x => { const n = parseInt(x.value) || 0; if (n) { dens[x.dataset.den] = n; total += n * +x.dataset.den; } });
  const coins = round2(parseFloat($('#coins')?.value) || 0);
  return { dens, coins, total: round2(total + coins), by: [$('#by1')?.value.trim() || '', $('#by2')?.value.trim() || ''] };
}
function syncType() {
  const t = document.querySelector('[name=type]:checked').value;
  $('#binf').hidden = !['Check', 'Cash'].includes(t);
  $('#ckf').hidden = t !== 'Check';
  $('#cashf').hidden = t !== 'Cash';
  $('#forf').hidden = t === 'Export';
}
function whoField(l, i) {
  const c = cats().find(c => c.Title === l.cat) || {};
  if (c.Needs === 'student') {
    const opt = x => `<option value="${esc(x.Title)}" ${l.who === x.Title ? 'selected' : ''}>${esc(x.Title)}${x.AasiSub == null ? ' (no AASI #)' : ''}</option>`;
    const cur = students().filter(x => x.Status !== 'Prior year'), prior = students().filter(x => x.Status === 'Prior year');
    return `<select data-i="${i}" data-k="who" aria-label="Student"><option value="">Student</option>${cur.map(opt).join('')}${prior.length ? `<optgroup label="Prior year">${prior.map(opt).join('')}</optgroup>` : ''}</select>`;
  }
  if (c.Needs === 'donor') return `<input data-i="${i}" data-k="who" value="${esc(l.who)}" placeholder="Donor name" aria-label="Donor name">`;
  return `<input data-i="${i}" data-k="who" value="${esc(l.who)}" placeholder="${c.Needs === 'desc' ? 'Describe it' : 'Note'}" aria-label="Description">`;
}
function drawLines() {
  $('#lines').innerHTML = S.lines.map((l, i) => `<div class="line">
    <select data-i="${i}" data-k="cat" aria-label="Category">${cats().map(c => `<option ${l.cat === c.Title ? 'selected' : ''}>${esc(c.Title)}</option>`).join('')}</select>
    ${whoField(l, i)}<input data-i="${i}" data-k="amt" inputmode="decimal" placeholder="0.00" value="${esc(l.amt)}" aria-label="Amount">
    ${S.lines.length > 1 ? `<button type="button" class="x" data-x="${i}" aria-label="Remove line">×</button>` : '<span></span>'}</div>`).join('');
  $('#bal').textContent = fmt(S.lines.reduce((a, l) => a + (parseFloat(l.amt) || 0), 0));
}
async function submit() {
  const type = document.querySelector('[name=type]:checked').value;
  const payer = $('#payer').value.trim(), date = $('#date').value || today();
  const fileList = [...$('#file').files];
  const isExport = type === 'Export';
  const lines = isExport ? [] : S.lines.map(l => {
    const st = cats().find(c => c.Title === l.cat)?.Needs === 'student' ? studentByName(l.who) : null;
    return { cat: l.cat, who: l.who.trim(), ...(st ? { sub: st.AasiSub ?? null } : {}), amt: round2(parseFloat(String(l.amt).replace(/[$,]/g, '')) || 0) };
  });
  const checkNo = type === 'Check' ? $('#checkno').value.trim() : '';
  const cash = type === 'Cash' ? cashCount() : null;
  if (!payer) throw new Error(isExport ? 'Name the export, like “FACTS payments Oct 12–18”.' : 'Add who it came from.');
  if (!isExport && lines.some(l => l.amt <= 0)) throw new Error('Every line needs an amount.');
  if (lines.some(l => cats().find(c => c.Title === l.cat)?.Needs === 'student' && !l.who)) throw new Error('Choose the student for each tuition line.');
  if (lines.some(l => cats().find(c => c.Title === l.cat)?.Needs === 'donor' && !l.who)) throw new Error('Add the donor’s name for each gift.');
  if (type === 'Check' && !checkNo) throw new Error('Add the check number.');
  if (cash) {
    if (round2(cash.total) !== round2(lines.reduce((a, l) => a + l.amt, 0))) throw new Error(`The cash count (${fmt(cash.total)}) doesn’t match the amounts below.`);
    if (!cash.by[0] || !cash.by[1]) throw new Error('Cash needs two people’s names on the count.');
  }
  if (type !== 'Cash' && !fileList.length) throw new Error('Attach the scan or confirmation.');
  const binId = ['Check', 'Cash'].includes(type) ? $('#bin').value : '';
  if (['Check', 'Cash'].includes(type) && !binId) throw new Error('There is no open bin. Ask StoreUp to open one.');
  const folder = `${schoolYear(date)}/${date.slice(0, 7)}`;
  const uploaded = [];
  for (const f of fileList) uploaded.push(await store.upload(f, folder, `${date}_${safeName(payer)}_${safeName(f.name)}`));
  const amount = round2(lines.reduce((a, l) => a + l.amt, 0));
  const item = await store.create('Submissions', { Title: payer, Kind: type, Amount: amount, Received: date, Lines: JSON.stringify(lines),
    BinId: binId ? Number(binId) : undefined, Status: 'Submitted', Files: JSON.stringify(uploaded), SubmittedBy: store.me.name,
    CheckNo: checkNo || undefined, CashCount: cash ? JSON.stringify(cash) : undefined });
  const ref = 'RC-' + String(item.id).padStart(4, '0');
  await store.update('Submissions', item.id, { Ref: ref });
  if (S.answering) { await store.update('Requests', S.answering, { Status: 'Answered', AnsweredWith: ref }); S.answering = null; }
  await log('Submitted', ref, `${type} ${fmt(amount)} from ${payer}`);
  await load(); S.tab = 'history'; S.filter = 'All'; render(); toast(`Submitted ${ref}${binId ? ' to the current bin' : ''}.`);
}

/* ---------- drawer ---------- */
function renderDrawer() {
  const h = $('#drawer-host');
  if (!S.drawer) { h.innerHTML = ''; return; }
  const k = S.drawer, s = subs().find(x => x.Ref === k), r = !s && S.data.Requests.find(x => x.id === k);
  if (!s && !r) { S.drawer = null; h.innerHTML = ''; return; }
  const ref = s ? s.Ref : r.id;
  const thread = S.data.Messages.filter(m => m.Ref === ref).sort((a, b) => +a.id - +b.id);
  let body = '';
  if (s) {
    const st = statusOf(s), fl = filesOf(s), chg = openChange(s.Ref);
    body = `<dl><dt>Status</dt><dd>${chip(st)}</dd><dt>Type</dt><dd>${esc(s.Kind)}${s.BinId ? ` · ${esc(binRef(s.BinId))}` : ''}</dd><dt>Received</dt><dd>${D(s.Received)}</dd><dt>Sent by</dt><dd>${esc(s.SubmittedBy)}</dd>${s.CheckNo ? `<dt>Check #</dt><dd>${esc(s.CheckNo)}</dd>` : ''}${s.Journal ? `<dt>Journal</dt><dd>${esc(s.Journal)}</dd>` : ''}</dl>
    ${linesOf(s).length ? `<div><div class="eyebrow" style="margin-bottom:6px">For</div>${linesOf(s).map(l => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--hair)"><span>${esc(l.cat)}${l.who ? `<div class="lock">${esc(l.who)}${'sub' in l ? (l.sub == null ? ' · no AASI #, will post for reclass' : (su() ? ` · AASI ${esc(l.sub)}` : '')) : ''}</div>` : ''}</span><span class="amt">${fmt(l.amt)}</span></div>`).join('')}</div>` : ''}
    ${s.CashCount ? (() => { const c = parse(s.CashCount, {}); return `<div><div class="eyebrow" style="margin-bottom:6px">Cash count</div><div class="lock">${Object.entries(c.dens || {}).map(([d, n]) => `${n} × $${d}`).join(' · ')}${c.coins ? ` · coins ${fmt(c.coins)}` : ''} = ${fmt(c.total)}<br>Counted by ${esc((c.by || []).join(' and '))}</div></div>`; })() : ''}
    <div><div class="eyebrow" style="margin-bottom:6px">Files</div><div class="files">${fl.length ? fl.map(f => `<button data-act="view" data-file="${esc(f.id)}">${esc(f.name)}</button>`).join('') : '<span class="lock">None attached.</span>'}</div></div>
    ${s.Status === 'Needs info' && s.Note ? `<div class="note"><b>StoreUp needs</b><p style="margin:4px 0 0">${esc(s.Note)}</p></div>` : ''}
    ${chg ? `<div class="note"><b>Change requested</b><p style="margin:4px 0 0">${esc(chg.Details)}</p>${su() ? '<p class="lock" style="margin:6px 0 0">Book the correcting entry, then close the request in Requests.</p>' : '<p class="lock" style="margin:6px 0 0">StoreUp will book a correcting entry.</p>'}</div>` : ''}
    ${drawerActions(s)}`;
  } else {
    body = `<dl><dt>Status</dt><dd>${chip(r.Status)}</dd><dt>Kind</dt><dd>${esc(r.Kind)}${r.Repeats ? ` · ${esc(r.Repeats)}` : ''}</dd>${r.Due ? `<dt>Due</dt><dd>${D(r.Due)}</dd>` : ''}${r.AnsweredWith ? `<dt>Answered with</dt><dd><button class="btn ghost" data-open="${esc(r.AnsweredWith)}">${esc(r.AnsweredWith)}</button></dd>` : ''}</dl>
    <p style="margin:0">${esc(r.Details)}</p>
    ${r.Kind === 'ASP deposit' ? `<label class="inline" style="font-size:14px"><input type="checkbox" data-act="asp-applied" data-id="${r.id}" ${r.AppliedInFacts ? 'checked' : ''} style="width:auto"> Applied to family accounts in FACTS</label>` : ''}
    ${r.Status === 'Open' && !su() && r.Kind !== 'Change request' ? `<div><button class="btn primary" data-act="answer" data-id="${r.id}">Upload it</button></div>` : ''}
    ${su() && r.Status !== 'Closed' ? `<div><button class="btn primary" data-act="req-close" data-id="${r.id}">${r.Repeats ? `Close and schedule the next one` : 'Close request'}</button></div>` : ''}`;
  }
  h.innerHTML = `<div class="drawer" role="dialog" aria-label="${esc(ref)}"><div class="dh"><div><div class="eyebrow">${esc(s ? s.Ref : r.Kind)}</div><h2>${esc(s ? `${s.Title} · ${fmt(s.Amount)}` : r.Title)}</h2></div><button class="btn" data-act="closedrawer">Close</button></div>
  <div class="db">${body}<div><div class="eyebrow" style="margin-bottom:8px">Conversation</div><div class="thread">${thread.map(m => `<div class="msg ${(m.Who === 'StoreUp') === su() ? 'us' : 'them'}"><div class="who">${esc(m.Author || m.Who)}</div>${esc(m.Body)}</div>`).join('') || '<span class="lock">No messages yet.</span>'}</div>
  <form id="reply" class="inline" style="margin-top:10px"><input id="rtxt" placeholder="Write to ${su() ? 'the school' : 'StoreUp'}" aria-label="Message"><button class="btn primary">Send</button></form></div></div></div>`;
  $('#reply').addEventListener('submit', e => { e.preventDefault(); run(async () => { const v = $('#rtxt').value.trim(); if (!v) return; await say(ref, v); await load(); render(); }); });
}
function drawerActions(s) {
  if (su()) {
    if (s._list !== 'Submissions') return '';
    const post = !s.BinId ? `<div class="f"><label for="je">Post it</label><div class="inline"><button class="btn" data-act="aasi-one" data-ref="${esc(s.Ref)}">AASI upload</button><input id="je" placeholder="AASI journal #"><button class="btn primary" data-act="post-one" data-ref="${esc(s.Ref)}">Mark posted</button></div></div>` : '<p class="lock" style="margin:0">Posts with its bin.</p>';
    const ask = `<div class="f"><label for="ni">Ask the school for something</label><div class="inline"><input id="ni" placeholder="Which student is this for?"><button class="btn" data-act="needinfo" data-ref="${esc(s.Ref)}">Send</button></div></div>`;
    return `${s.Status === 'Needs info' ? `<div><button class="btn" data-act="ready" data-ref="${esc(s.Ref)}">Info received, mark ready</button></div>` : ask}${post}`;
  }
  if (s._list === 'Posted' && !openChange(s.Ref)) return `<div class="f"><label for="chg">Something wrong? Posted items are locked.</label><textarea id="chg" rows="3" placeholder="Wrong student, should be Samuel Park"></textarea><div><button class="btn" data-act="reqchange" data-ref="${esc(s.Ref)}">Request a change</button></div></div>`;
  if (s._list === 'Submissions' && ['Submitted', 'Needs info'].includes(s.Status)) return `<div><button class="btn" data-act="withdraw" data-ref="${esc(s.Ref)}">Withdraw this submission</button><div class="lock" style="margin-top:4px">Only before StoreUp posts it. Take the check out of the bag too.</div></div>`;
  return '';
}

/* ---------- actions ---------- */
async function run(fn) {
  if (S.busy) return;
  S.busy = true; document.body.classList.add('busy');
  try { await fn(); }
  catch (e) { console.error(e); toast(e.status === 403 ? 'You don’t have permission to do that.' : (e.message || 'Something went wrong. Try again.')); }
  finally { S.busy = false; document.body.classList.remove('busy'); }
}
const binById = id => S.data.Bins.find(b => b.id === String(id));
const subByRef = ref => subs().find(s => s.Ref === ref);

const ACTIONS = {
  signout: () => store.signOut(),
  closedrawer: () => { S.drawer = null; renderDrawer(); },
  ask: el => { S.confirmBin = el.dataset.bin; render(); },
  cancel: () => { S.confirmBin = null; render(); },
  async close(el) {
    const b = binById(el.dataset.bin), v = $('#facts').value.trim();
    if (!v) throw new Error('Enter the FACTS check and cash total for these days.');
    const facts = round2(parseFloat(v.replace(/[$,]/g, '')));
    if (isNaN(facts)) throw new Error('The FACTS total should be a number, like 3410.00.');
    const d = today();
    await store.update('Bins', b.id, { Status: 'Closed', Closed: d, FactsTotal: facts, Title: `Deposit ${D(d)}` });
    const sy = schoolYear(d), no = Math.max(0, ...S.data.Bins.filter(x => x.SchoolYear === sy).map(x => +x.BinNo || 0)) + 1;
    await store.create('Bins', { Title: 'Current bin', BinNo: no, SchoolYear: sy, Status: 'Open', Opened: d });
    await log('Closed bin', b.id, `FACTS ${fmt(facts)}, bin ${fmt(binTotal(b))}`);
    S.confirmBin = null; await load(); render();
    toast(round2(binTotal(b) - facts) === 0 ? 'Closed. It matches FACTS. A new bin is open.' : `Closed, but the bin is ${fmt(Math.abs(binTotal(b) - facts))} ${binTotal(b) < facts ? 'short of' : 'over'} FACTS. StoreUp will see it.`);
  },
  async post(el) {
    const b = binById(el.dataset.bin), je = $(`#je-${b.id}`).value.trim();
    if (!je) throw new Error('Enter the AASI journal number first.');
    for (const s of binItems(b).filter(s => s._list === 'Submissions')) await moveToPosted(s, je);
    await store.update('Bins', b.id, { Status: 'Posted', Journal: je });
    await log('Posted bin', b.id, je); await load(); render(); toast(`Posted as ${je}. The school can verify now.`);
  },
  async 'post-one'(el) {
    const s = subByRef(el.dataset.ref), je = $('#je').value.trim();
    if (!je) throw new Error('Enter the AASI journal number first.');
    await moveToPosted(s, je); await log('Posted', s.Ref, je); S.drawer = null; await load(); render(); toast(`${s.Ref} posted.`);
  },
  async verify(el) { await store.update('Bins', el.dataset.bin, { Status: 'Verified' }); await log('Verified bin', el.dataset.bin); await load(); render(); toast('Verified. Take it to the bank.'); },
  async clear(el) { await store.update('Bins', el.dataset.bin, { Status: 'Reconciled' }); await log('Reconciled bin', el.dataset.bin); await load(); render(); toast('Reconciled.'); },
  async needinfo(el) {
    const s = subByRef(el.dataset.ref), v = $('#ni').value.trim();
    if (!v) throw new Error('Write what you need from the school.');
    await store.update('Submissions', s.id, { Status: 'Needs info', Note: v }); await say(s.Ref, v); await load(); render(); toast('Sent to the school.');
  },
  async ready(el) { const s = subByRef(el.dataset.ref); await store.update('Submissions', s.id, { Status: 'Ready', Note: '' }); await load(); render(); },
  async reqchange(el) {
    const s = subByRef(el.dataset.ref), v = $('#chg').value.trim();
    if (!v) throw new Error('Describe what should change.');
    await store.create('Requests', { Title: `Change to ${s.Ref}`, Kind: 'Change request', Status: 'Open', Ref: s.Ref, Details: v, Due: today() });
    await say(s.Ref, v); await log('Requested change', s.Ref, v); await load(); render(); toast('Change request sent to StoreUp.');
  },
  async withdraw(el) {
    const s = subByRef(el.dataset.ref);
    await store.remove('Submissions', s.id); await log('Withdrew', s.Ref); S.drawer = null; await load(); render(); toast(`${s.Ref} withdrawn.`);
  },
  answer(el) { S.answering = el.dataset.id; S.drawer = null; S.tab = 'submit'; render(); },
  async 'req-close'(el) {
    const r = S.data.Requests.find(x => x.id === el.dataset.id);
    await store.update('Requests', r.id, { Status: 'Closed' });
    if (r.Repeats) {
      const d = new Date((r.Due || today()) + 'T12:00');
      if (r.Repeats === 'Weekly') d.setDate(d.getDate() + 7); else if (r.Repeats === 'Every 2 weeks') d.setDate(d.getDate() + 14); else d.setMonth(d.getMonth() + 1);
      const due = d.toISOString().slice(0, 10);
      await store.create('Requests', { Title: r.Title, Kind: r.Kind, Repeats: r.Repeats, Status: 'Open', Details: r.Details, Due: due, ...(r.Kind === 'ASP deposit' ? { AppliedInFacts: false } : {}) });
    }
    S.drawer = null; await load(); render(); toast(r.Repeats ? 'Closed. The next one is scheduled.' : 'Request closed.');
  },
  'newreq-open': () => { S.newReq = true; render(); },
  'newreq-cancel': () => { S.newReq = false; render(); },
  async newreq() {
    const t = $('#rq-t').value.trim(); if (!t) throw new Error('Say what you need.');
    await store.create('Requests', { Title: t, Kind: $('#rq-k').value, Repeats: $('#rq-r').value || undefined, Due: $('#rq-d').value, Status: 'Open', Details: $('#rq-x').value.trim() });
    S.newReq = false; await load(); render(); toast('Request sent to the school.');
  },
  async view(el) {
    const f = await store.download(el.dataset.file);
    const url = URL.createObjectURL(f.blob.type ? f.blob : new Blob([f.blob], { type: f.type }));
    const w = window.open(url, '_blank', 'noopener');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  csv(el) {
    const b = binById(el.dataset.bin);
    const rows = [['Receipt', 'Received', 'Type', 'Check #', 'From', 'Category', 'Student / donor / note', 'AASI sub', 'Amount']];
    binItems(b).forEach(s => linesOf(s).forEach(l => rows.push([s.Ref, s.Received, s.Kind, s.CheckNo || '', s.Title, l.cat, l.who, l.sub ?? '', l.amt.toFixed(2)])));
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv' }), `${S.school.id}_${b.SchoolYear}_bin${String(b.BinNo).padStart(2, '0')}_lines.csv`);
  },
  async pdf(el) {
    const b = binById(el.dataset.bin);
    await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    const { PDFDocument } = window.PDFLib;
    const out = await PDFDocument.create();
    let added = 0;
    for (const s of binItems(b)) for (const f of filesOf(s)) {
      const { blob, type } = await store.download(f.id);
      const bytes = new Uint8Array(await blob.arrayBuffer()), t = (type || blob.type || f.name).toLowerCase();
      if (t.includes('pdf')) { const src = await PDFDocument.load(bytes); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)); added++; }
      else if (/jpe?g|png/.test(t)) {
        const img = /png/.test(t) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const W = 612, H = 792, sc = Math.min((W - 72) / img.width, (H - 72) / img.height, 1);
        out.addPage([W, H]).drawImage(img, { x: (W - img.width * sc) / 2, y: H - 36 - img.height * sc, width: img.width * sc, height: img.height * sc }); added++;
      }
    }
    if (!added) throw new Error('No scans in this bin to combine.');
    saveBlob(new Blob([await out.save()], { type: 'application/pdf' }), `${b.Journal || binName(b)}_backup.pdf`.replace(/\s+/g, '_'));
  },
  async provision() { await store.provision(); await load(); render(); toast('Lists created. Add categories and students next.'); },
  async firstbin() { const d = today(); await store.create('Bins', { Title: 'Current bin', BinNo: 1, SchoolYear: schoolYear(d), Status: 'Open', Opened: d }); await load(); render(); toast('The first bin is open.'); },
  async 'cat-add'() {
    const t = $('#cat-name').value.trim(); if (!t) throw new Error('Name the category.');
    await store.create('Categories', { Title: t, Needs: $('#cat-needs').value, Active: true, Sort: cats().length }); await load(); render();
  },
  async 'cat-off'(el) { await store.update('Categories', el.dataset.id, { Active: false }); await load(); render(); },
  async 'cat-sva'() {
    for (const c of cats()) await store.update('Categories', c.id, { Active: false });
    for (const [i, [t, n, code]] of SVA_SET.entries()) {
      await store.create('Categories', { Title: t, Needs: n, Active: true, Sort: i });
      if (code && !codingFor(t)) await store.create('Coding', { Title: t, ...code });
    }
    await load(); render(); toast('SVA categories loaded. Fill in the coding marked Open.');
  },
  async 'coding-save'(el) {
    const cat = el.dataset.cat, v = k => document.querySelector(`[data-cod="${k}"][data-cat="${CSS.escape(cat)}"]`).value.trim();
    const sub = v('Sub').toLowerCase();
    const f = { Title: cat, Account: v('Account') ? Number(v('Account')) : null, SubMode: sub === 'student' ? 'student' : 'fixed',
      Sub: sub === 'student' || sub === '' ? null : Number(sub), Function: v('Function'), Restriction: v('Restriction'), Prefix: v('Prefix') };
    if (f.Account != null && isNaN(f.Account)) throw new Error('Account should be a number, like 134100.');
    if (f.Sub != null && isNaN(f.Sub)) throw new Error('Subaccount should be “student” or a number.');
    if (/^\d+$/.test(f.Function) && f.Function.length < 4) f.Function = f.Function.padStart(4, '0');
    const have = codingFor(cat);
    have ? await store.update('Coding', have.id, f) : await store.create('Coding', f);
    await load(); render(); toast(`Coding saved for ${cat}.`);
  },
  async 'stu-add'() {
    const status = $('#stu-status').value, byName = new Map(S.data.Students.map(x => [x.Title, x]));
    const rows = $('#stu').value.split('\n').map(x => x.trim()).filter(Boolean).map(x => x.split(x.includes('\t') ? '\t' : ',').map(y => y.trim()));
    let added = 0, updated = 0;
    for (const [name, sub, f1, f2] of rows) {
      if (!name) continue;
      const fields = { Title: name, Active: true, Status: status, AasiSub: sub && !isNaN(+sub) ? Number(sub) : null, FactsId: f1 || '', FactsId2: f2 || '' };
      const have = byName.get(name);
      if (have) { await store.update('Students', have.id, fields); updated++; } else { await store.create('Students', fields); added++; }
    }
    await load(); render(); toast(`${added} added, ${updated} updated.`);
  },
  async 'recurring-defaults'() {
    const d = today();
    await store.create('Requests', { Title: 'FACTS deposit file', Kind: 'FACTS deposit', Repeats: 'Weekly', Due: d, Status: 'Open', Details: 'Upload the finished FACTS-to-AASI deposit .xlsx as-is. It posts as its own journal.' });
    await store.create('Requests', { Title: 'ASP deposit', Kind: 'ASP deposit', Repeats: 'Every 2 weeks', Due: d, Status: 'Open', AppliedInFacts: false, Details: 'Upload the ASP deposit report. Tick “Applied in FACTS” once the payments are applied to family accounts.' });
    await store.create('Requests', { Title: 'Square deposit', Kind: 'Square deposit', Repeats: 'Weekly', Due: d, Status: 'Open', Details: 'Upload the Square transfer details export for farm and POS sales.' });
    await load(); render(); toast('FACTS, ASP and Square requests added. Adjust the schedules in Requests.');
  },
  async aasi(el) { const b = binById(el.dataset.bin); await exportAasi(binItems(b), b.Closed || today(), `${S.school.id}_bin${b.SchoolYear}-${String(b.BinNo).padStart(2, '0')}`, `Bin ${b.SchoolYear}/${String(b.BinNo).padStart(2, '0')}`); },
  async 'aasi-one'(el) { const s = subByRef(el.dataset.ref); await exportAasi([s], s.Received, `${S.school.id}_${s.Ref}`, s.Ref); },
  async 'stu-clear'() { for (const s of S.data.Students.filter(s => s.Active !== false)) await store.update('Students', s.id, { Active: false }); await load(); render(); toast('All students marked inactive. Add this year’s list.'); }
};
/* ---------- AASI upload (contract from the aasi-upload-generator skill) ---------- */
const KIND_ABBR = { Check: 'Ck', Cash: 'Cash', Wire: 'Wire', ACH: 'ACH' };
function aasiRows(items, depositDate, label) {
  const rows = [], gaps = new Set(), reclass = [];
  for (const s of items) for (const l of linesOf(s)) {
    const c = codingFor(l.cat);
    if (!codingComplete(c)) { gaps.add(l.cat); continue; }
    const stu = c.SubMode === 'student';
    const sub = stu ? (l.sub ?? (l.who ? studentByName(l.who)?.AasiSub : null) ?? null) : c.Sub;
    const last = (l.who || '').trim().split(/\s+/).pop();
    let tail = '';
    if (stu && sub == null) { tail = ` - ${last} RECLASS`; reclass.push(`${s.Ref} ${l.who}`); }
    else if (!stu && l.who) tail = ` - ${l.who}`;
    const head = [c.Prefix, `${KIND_ABBR[s.Kind] || s.Kind}${s.CheckNo ? ' ' + s.CheckNo : ''}`, mdy(s.Received)].filter(Boolean).join(' ');
    const room = 50 - s.Ref.length - 1;
    rows.push({ sort: (l.who || s.Title).toLowerCase(), AccountCode: c.Account, SubAccountCode: sub ?? 0, FunctionCode: String(c.Function), RestrictionCode: String(c.Restriction),
      EntityValue: -round2(l.amt), Description: `${(head + tail).slice(0, room).trim()} ${s.Ref}` });
  }
  if (gaps.size) throw new Error(`Add AASI coding in Setup first for: ${[...gaps].join(', ')}.`);
  rows.sort((a, b) => a.sort.localeCompare(b.sort));
  const total = round2(-rows.reduce((a, r) => a + r.EntityValue, 0));
  rows.push({ AccountCode: 102100, SubAccountCode: 120, FunctionCode: '0000', RestrictionCode: '0A', EntityValue: total, Description: `Deposit ${mdy(depositDate)} ${label}`.slice(0, 50) });
  const net = round2(rows.reduce((a, r) => a + r.EntityValue, 0));
  if (Math.abs(net) > 0.005) throw new Error(`The upload doesn’t balance (net ${fmt(net)}). Nothing was exported.`);
  return { rows, total, reclass };
}
async function exportAasi(items, depositDate, fileTag, label) {
  if (!items.length) throw new Error('Nothing to export.');
  const { rows, total, reclass } = aasiRows(items, depositDate, label);
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const H = ['AccountCode', 'SubAccountCode', 'FundCode', 'FunctionCode', 'RestrictionCode', 'EntityValue', 'SendMemo', 'Description', 'DueDate', 'Memo', 'InvoiceNumber', 'InvoiceDate'];
  const ws = {}, A = XLSX.utils.encode_cell;
  H.forEach((h, c) => { ws[A({ r: 0, c })] = { t: 's', v: h }; });
  rows.forEach((r, i) => {
    const R = i + 1;
    ws[A({ r: R, c: 0 })] = { t: 'n', v: r.AccountCode };
    ws[A({ r: R, c: 1 })] = { t: 'n', v: r.SubAccountCode };
    ws[A({ r: R, c: 2 })] = { t: 'n', v: 10 };
    ws[A({ r: R, c: 3 })] = { t: 's', v: r.FunctionCode, z: '@' };      // must be text
    ws[A({ r: R, c: 4 })] = { t: 's', v: r.RestrictionCode, z: '@' };   // must be text
    ws[A({ r: R, c: 5 })] = { t: 'n', v: round2(r.EntityValue) };
    ws[A({ r: R, c: 6 })] = { t: 'b', v: false };
    ws[A({ r: R, c: 7 })] = { t: 's', v: r.Description };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: 11 } });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${depositDate}_AASI_JE_Ledge_${fileTag}.xlsx`);
  toast(`AASI upload saved: ${rows.length - 1} lines, deposit ${fmt(total)}.${reclass.length ? ` ${reclass.length} line(s) flagged RECLASS (no AASI #).` : ''}`);
}
async function moveToPosted(s, je) {
  const { id, _list, ...fields } = s;
  await store.create('Posted', { ...fields, Status: 'Posted', Journal: je, Note: '' });
  await store.remove('Submissions', id);
}
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
function loadScript(src) { return new Promise((ok, no) => { if ([...document.scripts].some(s => s.src === src)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load a helper library. Check your connection.')); document.head.append(s); }); }

document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-open],[data-act],[data-filter],[data-role]');
  if (!t || t.tagName === 'INPUT') return;
  if (t.dataset.tab) { S.tab = t.dataset.tab; S.drawer = null; S.answering = null; render(); scrollTo(0, 0); return; }
  if (t.dataset.filter) { S.filter = t.dataset.filter; render(); return; }
  if (t.dataset.open) { S.drawer = t.dataset.open; renderDrawer(); return; }
  if (t.dataset.role) { store.me = t.dataset.role === 'su' ? { name: 'Kevin (demo)', email: 'kevin@storeupfinancials.com', isStoreUp: true } : { name: 'Juanita (demo)', email: 'juanita@school.example', isStoreUp: false }; S.tab = 'home'; S.drawer = null; run(async () => { await load(); render(); }); return; }
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); run(() => fn(t)); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'school-pick') run(async () => { S.school = S.schools.find(s => s.id === e.target.value); await store.use(S.school); await load(); S.tab = 'home'; S.drawer = null; render(); });
  if (e.target.dataset.act === 'asp-applied') run(async () => { await store.update('Requests', e.target.dataset.id, { AppliedInFacts: e.target.checked }); await load(); render(); toast(e.target.checked ? 'Marked as applied in FACTS.' : 'Unmarked.'); });
  if (e.target.dataset.act === 'deposit' && e.target.files[0]) run(async () => {
    const b = binById(e.target.dataset.bin), f = e.target.files[0];
    const up = await store.upload(f, `${b.SchoolYear}/deposits`, `${today()}_deposit_${safeName(f.name)}`);
    await store.update('Bins', b.id, { Status: 'Deposited', DepositFile: JSON.stringify(up) });
    await log('Deposited bin', b.id); await load(); render(); toast('Deposit receipt uploaded.');
  });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.drawer) { S.drawer = null; renderDrawer(); } });

/* ---------- idle sign-out ---------- */
let lastActive = Date.now();
['click', 'keydown', 'pointermove', 'scroll'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
setInterval(() => { if (!store.demo && Date.now() - lastActive > cfg.idleMinutes * 60000) store.signOut(); }, 30000);

/* ---------- start ---------- */
(async () => {
  try {
    if (!(await store.start())) return;   // redirecting to Microsoft sign-in
    S.schools = await store.schools();
    if (!S.schools.length) { $('#gate-msg').innerHTML = `You’re signed in as ${esc(store.me.email)}, but no school has been shared with this account yet. Ask StoreUp to add you.<br><br><button class="btn" data-act="signout">Sign out</button>`; return; }
    S.school = S.schools[0];
    await store.use(S.school);
    await load();
    $('#gate').hidden = true; $('#app').hidden = false;
    render();
  } catch (e) {
    console.error(e);
    $('#gate-msg').textContent = `Ledge couldn’t load: ${e.message}`;
  }
})();
