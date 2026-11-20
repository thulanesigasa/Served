import QRCode from 'qrcode';
import { icon } from './icons.js';
import { guestOrdering, staffOrdering } from './ordering.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const params = new URLSearchParams(location.search);
const guest = params.has('venue') || params.has('ticket');
const demo = params.get('venue') === 'demo' || params.get('demo') === '1';
const screen = { tab: 'ordering', filter: 'all', queue: [], lastGood: true };
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const read = key => JSON.parse(localStorage.getItem(key) || 'null');
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const label = { waiting: 'Waiting', ready: 'Called', done: 'Completed', cancelled: 'Cancelled' };
const typeName = ticket => ticket.kind === 'table' ? 'Table' : 'Pickup';
const ticketNo = ticket => '#' + String(ticket.number).padStart(3, '0');
const link = query => location.origin + '/' + (query ? '?' + new URLSearchParams(query) : '');
const currentVenue = read('served.staff');
const guestLanding = params.has('guest') || (params.has('launch') && !currentVenue);
const hasStaff = Boolean(currentVenue);
const orderGuest = params.has('shell') || params.has('table') || params.has('order') || (guestLanding && !guest);
let orderingDashboard;
let installPrompt;
let toastTimer;
let guestVenue;
let ticket;
let sound;
let wakeLock;
let keepAwake = false;
let guestJoinId = guest ? (sessionStorage.getItem('served.join') || uuid()) : '';
let refreshing = false;
let issuedTicketId = sessionStorage.getItem('served.issued');

function notice(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4000);
}
async function request(path, { method = 'GET', data, staff = false } = {}) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (staff) headers.Authorization = 'Bearer ' + currentVenue.staffToken;
  const response = await fetch('/api/' + path, {
    headers, method, body: data ? JSON.stringify(data) : undefined, cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not connect. Try again.');
  return result;
}
function seedQueue() {
  const rows = [
    ['Maya Patel', 'table', 2, 'waiting', 14],
    ['Jordan Smith', 'order', 1, 'waiting', 9],
    ['Ava Williams', 'table', 4, 'waiting', 6],
    ['Liam Nkosi', 'table', 2, 'ready', 4],
    ['Amara Dlamini', 'order', 1, 'done', 23],
  ];
  return rows.map(([name, kind, size, status, mins], index) => ({
    name, kind, size, status, number: 101 + index, id: 'demo-' + index,
    created_at: Date.now() - mins * 60_000,
  }));
}
function demoQueue() {
  const saved = read('served.demo');
  if (saved) return saved;
  const rows = seedQueue();
  write('served.demo', rows);
  return rows;
}
function addDemo(data) {
  const rows = demoQueue();
  const existing = rows.find(row => row.id === data.id);
  if (existing) return existing;
  const row = { ...data, number: Math.max(100, ...rows.map(item => item.number)) + 1,
    status: 'waiting', created_at: Date.now() };
  write('served.demo', [...rows, row]);
  return row;
}
const brand = () => `<a class="brand" href="/" aria-label="Served home"><img class="brand-logo" src="/served-logo.png" alt="Served" width="100" height="43"></a>`;
const actionButton = (action, content, classes = '', title = '') =>
  `<button type="button" class="btn ${classes}" data-action="${action}" ${title ? `aria-label="${title}" title="${title}"` : ''}>${content}</button>`;
const navItems = [['ordering','bag','Orders'],['queue','grid','Live queue'],['qr','qr','Guest QR'],['history','history','History'],['install','download','Install app']];
const formFields = () => `
  <label>Name or order reference <input name="name" required maxlength="45" autocomplete="off" placeholder="e.g. Maya Patel"></label>
  <fieldset><legend>Ticket type</legend><div class="kinds">
    <label><input name="kind" type="radio" value="table" checked><span>${icon('table', 17)} Table</span></label>
    <label><input name="kind" type="radio" value="order"><span>${icon('bag', 17)} Pickup</span></label>
  </div></fieldset>
  <label data-party>Party size <input name="size" type="number" value="2" min="1" max="20" inputmode="numeric" required></label>
  <span class="error" aria-live="polite"></span>`;
function modal(title, contents) {
  dialog.innerHTML = `<div class="dialog-head"><h2>${title}</h2>${actionButton('close', icon('close'), 'icon-btn', 'Close')}</div>${contents}`;
  if (!dialog.open) dialog.showModal();
}
function statusPill(status) {
  return `<span class="status ${status}">${label[status]}</span>`;
}
function age(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min';
  return Math.floor(minutes / 60) + ' hr';
}
function ticketRow(row, history) {
  return `<div class="ticket-row" data-id="${escape(row.id)}" data-status="${row.status}">
    <div class="ticket-who"><span class="number">${ticketNo(row)}</span><strong>${escape(row.name)}</strong></div>
    <span class="ticket-kind">${icon(row.kind === 'table' ? 'table' : 'bag', 16)} ${typeName(row)}${row.kind === 'table' ? ` · ${row.size}` : ''}</span>
    <span class="dim ticket-age">${age(history ? row.closed_at || row.created_at : row.created_at)}</span>
    <span class="ticket-status">${statusPill(row.status)}</span>
    <div class="actions">${history ? '' : row.status === 'waiting'
      ? actionButton('ready', icon('bell', 16) + ' Call', 'pale')
      : actionButton('done', icon('check', 16) + ' Finish', 'pale')}
      ${history ? '' : actionButton('cancel-ticket', icon('close', 16), 'icon-btn', 'Cancel ticket')}</div>
    </div>`;
}
function queuePanel(history) {
  const rows = screen.queue.filter(row => history
    ? ['done','cancelled'].includes(row.status)
    : ['waiting','ready'].includes(row.status) && (screen.filter === 'all' || row.kind === screen.filter));
  rows.sort((a, b) => history ? b.number - a.number : a.number - b.number);
  return `<section class="surface"><div class="section-head"><div>
    <h2>${history ? 'Recently closed' : 'Active tickets'}</h2>
    <p>${history ? 'Completed and cancelled tickets from the past 24 hours.' : 'Call a ticket when its table or order is ready.'}</p>
    </div>${history ? '' : `<div class="filters" aria-label="Filter by ticket type">${[['all','All tickets'],['table','Tables'],['order','Pickups']].map(([value, text]) =>
      `<button type="button" data-action="filter-${value}" class="${value === screen.filter ? 'active' : ''}" aria-pressed="${value === screen.filter}">${text}</button>`).join('')}</div>`}</div>
    <div class="columns"><span>Ticket / guest</span><span>Type</span><span>${history ? 'Closed' : 'Wait time'}</span><span>Status</span><span>${history ? '' : 'Actions'}</span></div>
    ${rows.map(row => ticketRow(row, history)).join('') || `<div class="empty"><strong>${history ? 'No closed tickets yet' : 'No tickets in this view'}</strong>${history ? 'Finished and cancelled tickets will appear here.' : 'Add a ticket or share the guest QR code.'}</div>`}
  </section>`;
}
function qrPanel() {
  return `<section class="surface qr-panel">
    <div class="ticket-topline"><strong>${hasStaff ? escape(currentVenue.venue.name) : 'Served demo'}</strong><span class="eyebrow">Guest queue</span></div>
    <h2>${hasStaff ? 'Scan to join the queue' : 'Set up a guest QR'}</h2>
    <p>${hasStaff ? 'Put this QR code at the entrance or pickup counter. Guests can scan it and join from their phone.' : 'Create a venue to get a QR code that connects guests on other devices to your live queue.'}</p>
    <img id="qr-image" class="qr-image" alt="Guest queue QR code" width="242" height="242" hidden>
    <div class="guest-controls">${hasStaff ? actionButton('copy', icon('link', 16) + ' Copy link') +
      '<a id="qr-download" class="btn" download="served-guest-qr.png" hidden>Download QR</a>' +
      `<a class="btn" target="_blank" rel="noopener" href="${escape(guestLink())}">Open guest page</a>`
      : actionButton('setup', icon('plus', 17) + ' Set up a venue', 'primary') +
      `<a class="btn" target="_blank" rel="noopener" href="${escape(guestLink())}">Try guest view</a>`}</div>
  </section>`;
}
function guestLink() {
  return link({ venue: hasStaff ? currentVenue.venue.id : 'demo' });
}
function stats() {
  const items = [['users','Waiting','waiting'],['bell','Called','ready'],['check','Completed','done']];
  return `<div class="stats">${items.map(([symbol,text,status]) =>
    `<div class="stat"><span class="stat-icon">${icon(symbol)}</span><div><p class="stat-label">${text}</p><p class="stat-value">${screen.queue.filter(row => row.status === status).length}</p></div></div>`).join('')}</div>`;
}
function renderDashboard() {
  const titles = {
    ordering: ['Restaurant orders', 'Publish your menu, set up table QR codes and manage paid orders.'],
    queue: ['Live queue', 'Manage tables and pickups from one place.'],
    qr: ['Guest QR', 'Give guests a link to join the queue.'],
    history: ['Ticket history', 'See how recent tickets were closed.'],
    install: ['Install Served', 'Open Served from your phone’s home screen.'],
  };
  const [title, subtitle] = titles[screen.tab];
  const contents = {
    ordering: () => hasStaff ? '<section class="surface" id="staff-ordering"></section>'
      : `<section class="surface setup"><h2>Set up your restaurant</h2><p>Add a menu and create a QR code for each table.</p>${actionButton('setup', 'Set up a restaurant', 'primary')}</section>`,
    queue: () => stats() + queuePanel(false), qr: qrPanel, history: () => queuePanel(true),
    install: () => `<section class="surface setup"><h2>Add Served to your home screen</h2>
    <p><strong>Android:</strong> Open Served in Chrome and choose Install app or Add to Home screen from the menu.</p>
    <p><strong>iPhone:</strong> Open Served in Safari, tap Share and choose Add to Home Screen.</p>
    ${actionButton('install', icon('download', 18) + ' Install Served', 'primary')}</section>`,
  };
  app.innerHTML = `<div class="shell">
    <header class="top"><div class="top-inner">${brand()}
      <button type="button" class="venue" data-action="${hasStaff ? 'venue' : 'setup'}"><span class="venue-icon">${icon('building', 17)}</span><span>
        <strong>${hasStaff ? escape(currentVenue.venue.name) : 'Served demo'}</strong><small>${hasStaff ? 'Venue settings' : 'Set up a venue'}</small></span></button>
      <div class="top-actions">
        ${hasStaff ? '<button type="button" class="btn live" id="connection" data-action="venue" aria-label="Venue settings">' + (screen.lastGood ? 'Live' : 'Reconnecting') + '</button>' :
          actionButton('setup', 'Demo mode', 'mode-label', 'Demo mode. Set up a venue')}
        <a class="btn view-guest" href="${escape(link({ shell: 'guest' }))}" target="_blank" rel="noopener" aria-label="Guest view">${icon('phone', 17)} <span>Guest view</span></a>
      </div>
    </div></header>
    <nav class="nav" aria-label="Main navigation"><div class="nav-inner">${navItems.map(([key, symbol, text]) =>
      `<button type="button" class="${key === screen.tab ? 'active' : ''}" data-action="nav-${key}" ${key === screen.tab ? 'aria-current="page"' : ''}>${icon(symbol, 18)}${text}</button>`).join('')}</div></nav>
    <main class="dashboard" id="dashboard">
      <div class="heading"><div><p class="eyebrow">Host stand</p><h1>${title}</h1><p>${subtitle}</p></div>
      ${screen.tab === 'queue' ? actionButton('add', icon('plus', 18) + ' New ticket', 'primary') : ''}</div>
      <div id="dashboard-content">${contents[screen.tab]()}</div>
    </main>
  </div>`;
  if (screen.tab === 'qr' && hasStaff) setQr();
  if (screen.tab === 'ordering' && hasStaff) {
    orderingDashboard ||= staffOrdering(app, currentVenue, { notice, modal });
    orderingDashboard.render();
    orderingDashboard.refresh();
  }
}
function updateDashboard() {
  const content = document.querySelector('#dashboard-content');
  if (!content) return renderDashboard();
  const connection = document.querySelector('#connection');
  if (connection) connection.textContent = screen.lastGood ? 'Live' : 'Reconnecting';
  if (screen.tab === 'queue' || screen.tab === 'history') {
    const active = document.activeElement;
    const rowId = active?.closest('[data-id]')?.dataset.id;
    const action = active?.dataset.action;
    content.innerHTML = screen.tab === 'queue' ? stats() + queuePanel(false) : queuePanel(true);
    if (action) Array.from(content.querySelectorAll('[data-action]')).find(element =>
      element.dataset.action === action && element.closest('[data-id]')?.dataset.id === rowId)?.focus({ preventScroll: true });
  }
}
async function setQr() {
  try {
    const data = await QRCode.toDataURL(guestLink(), { width: 720, margin: 4 });
    const img = document.querySelector('#qr-image');
    const download = document.querySelector('#qr-download');
    if (!img || !download) return;
    img.src = data;
    img.hidden = false;
    download.href = data;
    download.hidden = false;
  } catch {
    notice('QR code unavailable. You can still copy the guest link.');
  }
}

function renderGuestHome() {
  const recentTicket = read('served.lastTicket');
  app.innerHTML = `<main class="guest"><header class="guestheader">${brand()}
    ${actionButton('install', icon('download', 17), 'icon-btn', 'Install Served')}</header>
    <section class="surface guest-card guest-entry"><span class="tile-icon">${icon('bell', 25)}</span>
    <h1>Find your queue</h1><p>Scan the restaurant’s QR code with your phone camera or paste its Served link here.</p>
    ${recentTicket ? `<p><a class="btn" href="${escape(link({ ticket: recentTicket }))}">Open my last ticket</a></p>` : ''}
    <form id="guest-link-form"><label>Guest link <input name="link" type="url" required autocomplete="off"
      placeholder="Paste the link from the restaurant"></label><span class="error" aria-live="polite"></span>
    <button class="btn primary">Open queue</button></form></section>
    <p class="info"><a href="${link({ venue: 'demo' })}">Try the demo</a> · <a href="/">Staff dashboard</a></p></main>`;
}
const ordinalSuffix = position => {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[position % 10] || 'th';
};
const ticketTime = timestamp => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function ticketStub(item) {
  return `<div class="ticket-stub">
    <div class="stub-number"><span class="eyebrow">Ticket</span><strong>${ticketNo(item)}</strong></div>
    <div class="stub-details"><strong>${escape(item.name)}</strong><span>${item.kind === 'table' ? `Table for ${item.size}` : 'Order pickup'}</span><span>Joined at ${escape(ticketTime(item.created_at))}</span></div>
  </div>`;
}
function renderGuest(message = '') {
  const header = `<header class="guestheader">${brand()}${actionButton('install', icon('download', 17), 'icon-btn', 'Install Served')}</header>`;
  let body;
  let cardState = '';
  if (message) {
    body = `<div class="ticket-main"><h1>${guestVenue || ticket ? 'Connection interrupted' : 'Guest queue'}</h1>
      <p role="status">${escape(message)}</p>${actionButton('retry', 'Try again', 'primary')}</div>`;
  } else if (ticket) {
    const isTable = ticket.kind === 'table';
    const isWaiting = ticket.status === 'waiting';
    const position = ticket.position;
    const details = {
      waiting: ['You’re in the queue', position === 1 ? 'You’re next. We’ll let you know when to come up.' :
        `${position - 1} ${position === 2 ? 'ticket' : 'tickets'} ahead of you.`],
      ready: [isTable ? 'Your table is ready!' : 'Your order is ready!', isTable ? 'Show this ticket at the host stand.' : 'Show this ticket at the pickup counter.'],
      done: ['You’re all set', 'This ticket has been completed.'],
      cancelled: ['Ticket cancelled', 'Speak to staff if you still need help.'],
    };
    const [title, description] = details[ticket.status];
    cardState = `is-${ticket.status}`;
    if (issuedTicketId === ticket.id) {
      cardState += ' ticket-reveal';
      issuedTicketId = null;
      sessionStorage.removeItem('served.issued');
    }
    const status = isWaiting ? 'In the queue' : ticket.status === 'ready' ? 'Called' : label[ticket.status];
    body = `<div class="ticket-topline"><strong>${escape(ticket.venue_name)}</strong><span class="eyebrow">${status}</span></div>
      <div class="ticket-main">
        ${isWaiting ? `<h1 id="ticket-state" class="position-title" aria-live="polite" aria-label="You’re ${position}${ordinalSuffix(position)} in line">
          <span class="position-lead">You’re</span><span class="position-number">${position}<sup>${ordinalSuffix(position)}</sup></span><span class="position-tail">in line</span></h1>`
          : `<span class="tile-icon">${icon(ticket.status === 'ready' ? 'bell' : 'check', 26)}</span>
             <h1 id="ticket-state" aria-live="polite">${title}</h1>`}
        ${isWaiting ? `<p class="wait-estimate">Estimated wait · about ${ticket.estimated_wait_minutes} min</p>` : ''}
        <p>${description}</p>
      </div>${ticketStub(ticket)}
      <div class="ticket-footer">
      ${isWaiting ? `<div class="guest-controls">
        ${actionButton('sound', icon('volume', 17) + (sound?.state === 'running' ? ' Sound enabled' : ' Enable sound'))}
        ${actionButton('awake', icon('phone', 17) + (keepAwake ? ' Keep awake on' : ' Keep screen awake'))}
      </div><p class="info" id="guest-connection">Keep this ticket open to receive your call.</p>`
        : `<a href="${escape(link({ venue: ticket.venue_id }))}" class="btn ${ticket.status === 'ready' ? 'primary' : ''}">Back to guest queue</a>`}
      </div>`;
  } else if (guestVenue) {
    body = `<div class="ticket-topline"><strong>${escape(guestVenue.name)}</strong><span class="eyebrow">Guest queue</span></div>
      <div class="ticket-main"><h1>Join the queue</h1><p>Get a ticket and we’ll call you when your table or order is ready.</p>
      <form id="guest-form">${formFields()}<button class="btn primary">Get my ticket</button></form></div>`;
  } else {
    body = '<div class="ticket-main"><h1>Opening your queue</h1><p role="status">Connecting to Served…</p></div>';
  }
  app.innerHTML = `<main class="guest">${header}<section class="surface guest-card ${cardState}">${body}</section>
    ${demo ? '<p class="info">Demo tickets sync between tabs in this browser.</p>' : ''}</main>`;
}
function demoTicket(id) {
  const queue = demoQueue();
  const row = queue.find(item => item.id === id);
  if (!row) throw new Error('This demo ticket is only available in the browser where you created it.');
  const position = queue.filter(item => item.number < row.number && item.status === 'waiting' && item.kind === row.kind).length + 1;
  return { ...row, venue_id: 'demo', venue_name: 'Served demo', position, estimated_wait_minutes: position * (row.kind === 'table' ? 6 : 4) };
}
async function refreshGuest(initial = false) {
  const id = params.get('ticket');
  try {
    if (id) {
      const next = demo ? demoTicket(id) : await request('tickets/' + encodeURIComponent(id));
      if (ticket?.status === 'waiting' && next.status === 'ready') ring();
      if (JSON.stringify(ticket) !== JSON.stringify(next) || !screen.lastGood) {
        const active = document.activeElement?.dataset.action;
        ticket = next;
        screen.lastGood = true;
        if (ticket.status !== 'waiting' && wakeLock) await wakeLock.release().catch(() => {});
        renderGuest();
        if (active) app.querySelector(`[data-action="${active}"]`)?.focus({ preventScroll: true });
      }
    } else if (!guestVenue) {
      guestVenue = demo ? { id:'demo', name:'Served demo' } :
        await request('venues/' + encodeURIComponent(params.get('venue')));
      renderGuest();
    }
  } catch (error) {
    screen.lastGood = false;
    if (!ticket || initial) renderGuest(error.message);
    else {
      const connection = document.querySelector('#guest-connection');
      if (connection) connection.textContent = 'Connection interrupted. Reconnecting…';
    }
  }
}
async function refresh() {
  if (guestLanding || orderGuest || refreshing || document.hidden) return;
  refreshing = true;
  try {
    if (guest) return await refreshGuest();
    const next = hasStaff ? await request('venues/' + currentVenue.venue.id + '/queue', { staff:true }) : demoQueue();
    if (!screen.lastGood || JSON.stringify(next) !== JSON.stringify(screen.queue)) {
      screen.lastGood = true;
      screen.queue = next;
      updateDashboard();
    }
  } catch {
    screen.lastGood = false;
    updateDashboard();
  } finally {
    refreshing = false;
  }
}
function ring() {
  navigator.vibrate?.([180, 100, 180, 100, 280]);
  if (!sound || sound.state !== 'running') return;
  for (const [index, frequency] of [660, 880, 990].entries()) {
    const time = sound.currentTime + index * .18;
    const tone = sound.createOscillator();
    const gain = sound.createGain();
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(.17, time + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .16);
    tone.connect(gain).connect(sound.destination);
    tone.start(time);
    tone.stop(time + .17);
  }
}
async function requestWake() {
  if (wakeLock && !wakeLock.released) return;
  if (!navigator.wakeLock) throw new Error('This browser does not support keeping the screen awake.');
  wakeLock = await navigator.wakeLock.request('screen');
}
async function changeTicket(id, status) {
  if (hasStaff) {
    await request('venues/' + currentVenue.venue.id + '/queue', { method:'PATCH', data:{ id, status }, staff:true });
  } else {
    const now = Date.now();
    write('served.demo', demoQueue().map(row => row.id === id ? {
      ...row, status, ...(status === 'ready' ? { called_at: now } : { closed_at: now }),
    } : row));
  }
  screen.queue = screen.queue.map(row => row.id === id ? { ...row, status } : row);
  updateDashboard();
  notice(status === 'ready' ? 'Guest called' : status === 'done' ? 'Ticket completed' : 'Ticket cancelled');
  refresh();
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button[data-action]');
  const action = target?.dataset.action;
  if (!action || target.disabled) return;
  if (action.startsWith('nav-')) {
    screen.tab = action.slice(4);
    renderDashboard();
    app.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  if (action.startsWith('filter-')) {
    screen.filter = action.slice(7);
    updateDashboard();
    return;
  }
  try {
    if (action === 'close') return dialog.close();
    if (action === 'setup') return modal('Set up a venue', `<p class="dialog-copy">Create a live queue and a QR code for your guests.</p>
      <form id="setup-form"><label>Venue name <input name="name" required maxlength="60" autocomplete="organization" placeholder="e.g. The Corner Café"></label>
      <span class="error" aria-live="polite"></span><button class="btn primary">Create venue</button><a href="/?staff=restore">Use a staff access key</a></form>`);
    if (action === 'venue') return modal('Venue settings', `<p class="dialog-copy">${escape(currentVenue.venue.name)}</p>
      <p class="dialog-copy">This browser holds your staff access key. Save a copy to open the same queue on another device.</p>
      ${actionButton('key', 'Copy staff access key')}`);
    if (action === 'key') {
      await navigator.clipboard.writeText(currentVenue.venue.id + '.' + currentVenue.staffToken);
      return notice('Staff access key copied');
    }
    if (action === 'add') return modal('New ticket', `<form id="staff-form">${formFields()}<button class="btn primary">Add ticket</button></form>`);
    if (action === 'install') {
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
        return;
      }
      return modal('Install Served', `<p class="dialog-copy"><strong>Android:</strong> Open Served in Chrome and choose Install app or Add to Home screen.</p>
        <p class="dialog-copy"><strong>iPhone:</strong> Open Served in Safari, tap Share and choose Add to Home Screen.</p>`);
    }
    if (action === 'copy') {
      await navigator.clipboard.writeText(guestLink());
      return notice('Guest link copied');
    }
    if (action === 'retry') return refreshGuest(true);
    if (action === 'sound') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Sound alerts are unavailable in this browser.');
      sound ||= new Audio();
      await sound.resume();
      ring();
      renderGuest();
      return;
    }
    if (action === 'awake') {
      if (keepAwake) {
        await wakeLock?.release();
        keepAwake = false;
      } else {
        await requestWake();
        keepAwake = true;
      }
      renderGuest();
      return;
    }
    if (action === 'cancel-ticket') {
      const id = target.closest('[data-id]').dataset.id;
      return modal('Cancel this ticket?', `<p class="dialog-copy">The guest’s ticket will show as cancelled.</p>
        <div data-id="${escape(id)}" class="actions">${actionButton('cancelled', 'Cancel ticket', 'primary')}${actionButton('close', 'Keep ticket')}</div>`);
    }
    if (['ready','done','cancelled'].includes(action)) {
      target.disabled = true;
      await changeTicket(target.closest('[data-id]').dataset.id, action);
      if (dialog.open) dialog.close();
    }
  } catch (error) {
    target.disabled = false;
    notice(error.message);
    if (!guest) refresh();
  }
});
document.addEventListener('change', event => {
  if (event.target.name !== 'kind') return;
  const party = event.target.form.querySelector('[data-party]');
  party.hidden = event.target.value !== 'table';
  party.querySelector('input').disabled = party.hidden;
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['setup-form','guest-form','staff-form','restore-form','guest-link-form'].includes(form.id)) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"], button:not([type])');
  const error = form.querySelector('.error');
  const guestForm = form.id === 'guest-form';
  let building;
  let started;
  if (guestForm) {
    building = document.createElement('div');
    building.className = 'ticket-build';
    building.setAttribute('role', 'status');
    building.innerHTML = `<span>${icon('history', 36)}</span><span>Building your ticket</span>`;
    started = performance.now();
  }
  const values = new FormData(form);
  if (submit.disabled) return;
  submit.disabled = true;
  error.textContent = '';
  try {
    if (form.id === 'guest-link-form') {
      const url = new URL(values.get('link'));
      const venue = url.searchParams.get('venue');
      const ticketId = url.searchParams.get('ticket');
      if (url.origin !== location.origin || url.pathname !== '/' ||
          ![venue, ticketId].some(value => /^[a-f0-9]{32}$/.test(value || ''))) {
        throw new Error('Paste the Served link from your restaurant.');
      }
      return location.assign(link(ticketId ? { ticket: ticketId } : { venue }));
    }
    if (form.id === 'setup-form') {
      const config = await request('venues', { method:'POST', data:{ name: values.get('name') } });
      write('served.staff', config);
      return location.assign('/');
    }
    if (form.id === 'restore-form') {
      const [id, staffToken] = values.get('key').trim().split('.');
      if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(staffToken)) throw new Error('Enter a valid staff access key.');
      const venue = await request('venues/' + id);
      const check = await fetch('/api/venues/' + id + '/queue', { headers: { Authorization: 'Bearer ' + staffToken }, cache: 'no-store' });
      if (!check.ok) throw new Error('Could not open this venue with that key.');
      write('served.staff', { venue, staffToken });
      return location.assign('/');
    }
    const fromGuest = form.id === 'guest-form';
    const useDemo = fromGuest ? demo : !hasStaff;
    const venueId = fromGuest ? guestVenue.id : currentVenue?.venue.id;
    const data = { id: fromGuest ? guestJoinId : (form.dataset.joinId ||= uuid()),
      name: values.get('name').trim(), kind: values.get('kind'), size: Number(values.get('size') || 1) };
    if (!data.name) throw new Error('Enter a name or order reference.');
    if (fromGuest) {
      sessionStorage.setItem('served.join', guestJoinId);
      form.hidden = true;
      form.after(building);
    }
    const item = useDemo ? addDemo(data) : await request('venues/' + venueId + '/join', { method:'POST', data });
    if (fromGuest) {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 650 - (performance.now() - started))));
      }
      sessionStorage.setItem('served.issued', item.id);
      sessionStorage.removeItem('served.join');
      if (!demo) write('served.lastTicket', item.id);
      return location.assign(link(demo ? { ticket: item.id, demo: '1' } : { ticket: item.id }));
    }
    screen.queue = [...screen.queue.filter(row => row.id !== item.id), item];
    dialog.close();
    updateDashboard();
    notice('Ticket added ' + ticketNo(item));
    refresh();
  } catch (problem) {
    if (building) {
      building.remove();
      form.hidden = false;
    }
    error.textContent = problem.message;
    submit.disabled = false;
  }
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('storage', event => { if (event.key === 'served.demo') refresh(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (keepAwake && ticket?.status === 'waiting') requestWake().catch(() => {});
    refresh();
  }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (orderGuest) {
  guestOrdering(app, params);
} else if (guest) {
  renderGuest();
} else if (guestLanding) {
  renderGuestHome();
} else {
  if (!hasStaff) screen.queue = demoQueue();
  renderDashboard();
  if (params.get('staff') === 'restore' && !hasStaff) modal('Open a venue', `<form id="restore-form">
    <label>Staff access key <input name="key" required autocomplete="off" spellcheck="false"></label>
    <span class="error" aria-live="polite"></span><button class="btn primary">Open venue</button></form>`);
}
if (!guestLanding && !orderGuest) {
  refresh();
  setInterval(refresh, 3500);
}
