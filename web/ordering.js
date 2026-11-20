import QRCode from 'qrcode';
import { icon } from './icons.js';
import { demoMenu } from './demo-menu.js';
import { demoItems, menuCategories } from './menu-catalog.js';

export const demoMenuCode = 'c98f5fc36be3439eba270a18abbbf2ac';

const statuses = {
  pending: ['Awaiting payment', 'Your order will go to the kitchen once payment is confirmed.'],
  paid: ['Order placed', 'The kitchen has received your order.'],
  preparing: ['Preparing', 'The kitchen is preparing your order.'],
  ready: ['Ready', 'Your waiter will serve you shortly.'],
  delivered: ['Delivered', 'Your order is complete.'],
};
const tabs = [['feed', 'bag', 'Feed'], ['history', 'history', 'History'], ['shops', 'building', 'Shops'], ['settings', 'settings', 'Settings']];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const validId = value => /^[a-f0-9]{32}$/.test(value ?? '');
const money = cents => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
const orderNumber = value => '#' + String(value).padStart(3, '0');
const url = params => '/?' + new URLSearchParams(params);
const displayDate = value => new Date(value).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' });
const button = (action, label, classes = '', value = '') =>
  `<button type="button" class="btn ${classes}" data-order-action="${action}" data-value="${esc(value)}">${label}</button>`;

async function api(path, token, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method, cache: 'no-store',
    headers: { ...(body ? { 'Content-Type':'application/json' } : {}), ...(token ? { Authorization:'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(18_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not connect to Served. Try again.');
  return data;
}

function listItems(items) {
  return `<ul class="food-list">${items.map(item => `<li><span>${item.quantity} × ${esc(item.name)}</span><span>${money(item.price * item.quantity)}</span></li>`).join('')}</ul>`;
}
function smallOrder(order) {
  return `<div class="order-line"><div><strong>${esc(order.venue_name || order.table_label)} · ${order.status === 'pending' ? 'Checkout' : orderNumber(order.number)}</strong>
    <p>${esc(order.table_label)} · ${displayDate(order.created_at)}</p></div>
    <div><span>${statuses[order.status][0]}</span><br><strong>${money(order.total)}</strong></div>
    ${button('open-order', 'View', '', order.id)}</div>`;
}

export function guestOrdering(app, params) {
  const native = params.has('native') && Boolean(window.ReactNativeWebView);
  let session;
  let screen = 'feed';
  let table;
  let order;
  let orderId = params.get('order');
  let tableId = params.get('table') || params.get('venue');
  let quantities = {};
  let checkoutId = null;
  let issue = '';
  let loading = false;
  let syncBusy = false;
  let historyList = [];
  let accountShops = [];
  let savedName = '';
  let savedEmail = '';
  let sessionLoaded = !native;
  let sound = localStorage.getItem('served.orderSound') !== 'off';
  let audio;
  let refreshTicket = false;
  let menuRequest = 0;
  let demoOnly = params.has('demo-menu');
  let category = 'All';
  let cartOpen = false;
  let placed = null;
  let demoPayment = false;
  const demoMode = () => demoOnly || Boolean(table && (!table.items.length || !table.payment_available));
  const selection = () => table?.items.length ? table.items : demoMode() ? demoItems : [];
  const holder = () => {
    let id = localStorage.getItem('served.tableHolder');
    if (!validId(id)) {
      id = crypto.randomUUID().replaceAll('-', '');
      localStorage.setItem('served.tableHolder', id);
    }
    return id;
  };
  const reservationCall = (id, data) => api('menus/' + id + '/reservation', token(), 'POST', { holder:holder(), ...data });
  const sessionKey = key => 'served.' + key + (native ? '.' + (session?.guest.id || 'native') : '');
  const saved = key => {
    try { return JSON.parse(localStorage.getItem(sessionKey(key)) || '[]'); }
    catch { return []; }
  };
  const store = (key, values) => localStorage.setItem(sessionKey(key), JSON.stringify(values.slice(0, 100)));
  const send = (action, value) => window.ReactNativeWebView?.postMessage(JSON.stringify({ action, value }));
  const token = () => session?.token;
  const total = () => selection().reduce((sum, item) => sum + item.price * (quantities[item.id] || 0), 0);
  const count = () => Object.values(quantities).reduce((sum, value) => sum + value, 0);

  function ring() {
    if (!sound) return;
    navigator.vibrate?.([180, 100, 180]);
    if (audio?.state !== 'running') return;
    const pitch = audio.createOscillator(), gain = audio.createGain();
    pitch.connect(gain).connect(audio.destination);
    pitch.frequency.value = 740;
    gain.gain.setValueAtTime(.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .4);
    pitch.start();
    pitch.stop(audio.currentTime + .4);
  }

  function rememberOrder(candidate) {
    const orders = [candidate.id, ...saved('foodOrders').filter(id => id !== candidate.id)];
    store('foodOrders', orders);
  }

  function reservationCard() {
    if (!table || table.general) return '';
    const reserved = table.reservation?.expires_at > Date.now();
    const alternatives = table.alternatives?.length ? ' Available when checked: ' + table.alternatives.join(', ') + '.' : '';
    return `<section class="table-hold" aria-label="Table reservation">
      <strong>${esc(table.label)}</strong>
      ${table.reservation?.busy ? `<p role="status">This table is already reserved. Choose another table and scan its QR code.${esc(alternatives)}</p>`
        : reserved ? '<p>Reserved for you until ' + new Date(table.reservation.expires_at).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }) + '.</p>' : '<p>Hold this table for 30 minutes.</p>'}
      ${reserved && !table.reservation?.busy ? button('release-table', 'Release table') : ''}
      ${!reserved ? button('reserve-table', table.reservation?.busy ? 'Check again' : 'Reserve table', 'primary') : ''}
      ${native && table.reservation?.busy ? button('scan', 'Scan another table') : ''}
    </section>`;
  }

  function chooseTable() {
    return `<div class="table-hold"><strong>Choose your table to check out</strong>
      ${table.tables.length ? table.tables.map(candidate =>
        button('select-table', esc(candidate.label), '', candidate.id)).join('') : '<p>No tables are currently available. Ask staff for a table QR code.</p>'}
      ${native ? button('scan', 'Scan table QR') : ''}
    </div>`;
  }

  function menuCard() {
    return `<section class="order-paper">
      <p class="eyebrow">${esc(table.label)}</p>
      <h1>${esc(table.venue_name)}</h1>
      ${reservationCard()}
      <h2>Menu</h2>
      ${table.items.length ? `<ul class="menu-list">${table.items.map(item => {
        const quantity = quantities[item.id] || 0;
        return `<li><div><strong>${esc(item.name)}</strong>${item.description ? `<p>${esc(item.description)}</p>` : ''}<span>${money(item.price)}</span></div>
          <div class="quantity" aria-label="${esc(item.name)} quantity">
            ${button('minus', '<span aria-hidden="true">−</span><span class="order-sr">Remove ' + esc(item.name) + '</span>', '', item.id)}
            <span aria-live="polite">${quantity}</span>
            ${button('plus', '<span aria-hidden="true">+</span><span class="order-sr">Add ' + esc(item.name) + '</span>', '', item.id)}
          </div></li>`;
      }).join('')}</ul>` : '<p>The restaurant hasn’t published its menu yet.</p>'}
      ${count() ? table.general ? chooseTable() : `<form id="order-checkout" class="order-checkout">
        <h2>Your order</h2>
        ${listItems(table.items.filter(item => quantities[item.id]).map(item => ({ ...item, quantity: quantities[item.id] })))}
        <p class="order-total"><strong>${count()} items</strong><strong>${money(total())}</strong></p>
        ${native ? '' : `<label>Name <input name="name" value="${esc(savedName)}" required maxlength="45" autocomplete="name"></label>
          <label>Email for payment <input name="email" value="${esc(savedEmail)}" required type="email" maxlength="254" autocomplete="email"></label>`}
        <button class="btn primary" ${loading || table.reservation?.busy || !table.payment_available ? 'disabled' : ''}>${loading ? 'Opening checkout…' : 'Pay ' + money(total())}</button>
      </form>` : ''}
      ${!native ? `<p><a href="served://open?url=${encodeURIComponent(location.origin + url({ table:table.id }))}">Open menu in Served app</a></p>` : ''}

      </section>`;
  }

  function ticket() {
    if (order.status === 'pending') return `<section class="order-paper">
      <p class="eyebrow">${esc(order.venue_name)} · ${esc(order.table_label)}</p>
      <h1>Complete payment</h1><p>Your ticket will appear after payment is confirmed.</p>
      ${listItems(order.items)}
      <p class="order-total"><strong>Total</strong><strong>${money(order.total)}</strong></p>
      ${order.payment_url ? button('pay', 'Resume payment', 'primary') : ''}
      ${button('verify', 'Check payment')}
    </section>`;
    const [label, message] = statuses[order.status];
    return `<section class="order-paper order-ticket ${order.status === 'ready' ? 'order-ready' : ''}">
      <p class="eyebrow">${esc(order.venue_name)} · ${esc(order.table_label)}</p>
      <h1>${label}</h1><p role="status">${message}</p>
      <div class="order-ticket-stub"><span>Order ${orderNumber(order.number)}</span><strong>${esc(order.guest_name)}</strong></div>
      ${listItems(order.items)}
      <p class="order-total"><strong>Total</strong><strong>${money(order.total)}</strong></p>
      <div class="order-buttons">
        ${order.status === 'ready' ? button('received', 'I received my order', 'primary') : ''}
        ${!native && sound && !audio && ['paid','preparing'].includes(order.status) ? button('enable-sound', 'Enable sound') : ''}
        ${button('new-order', 'Scan another table')}
        ${native ? '' : `<a class="btn" href="served://open?url=${encodeURIComponent(location.origin + url({ order:order.id }))}">Open in Served app</a>`}
      </div></section>`;
  }

  function landing() {
    return `<section class="order-paper"><h1>Your order feed</h1>
      <p>Scan a restaurant or table QR code to view the menu and order.</p>
      ${native ? button('scan', icon('qr', 18) + ' Scan menu QR', 'primary') : ''}
      <form id="order-link"><label>Menu link<input type="url" name="link" required placeholder="Paste the restaurant’s menu link"></label>
      <button class="btn ${native ? '' : 'primary'}">Open menu</button></form>
      ${button('demo-menu', 'Try the demo menu')}
      ${saved('foodOrders').length ? button('open-order', 'Resume last order', '', saved('foodOrders')[0]) : ''}
    </section>`;
  }

  function render(focus) {
    const localShops = saved('visitedShops');
    const shops = [...localShops, ...accountShops.filter(shop => !localShops.some(local => local.id === shop.id))]
      .sort((a, b) => b.date - a.date);
    const content = !sessionLoaded ? '<section class="order-paper"><h1>Opening your feed</h1></section>'
      : screen === 'history' ? `<section class="order-paper"><h1>Order history</h1>${historyList.length ? historyList.map(smallOrder).join('') : '<p>Your orders will appear here.</p>'}</section>`
      : screen === 'shops' ? `<section class="order-paper"><h1>Visited shops</h1>${shops.length ? shops.map(shop => `<div class="order-line"><div><strong>${esc(shop.name)}</strong><p>Last visit ${displayDate(shop.date)}</p></div></div>`).join('') : '<p>Restaurants you visit will appear here.</p>'}
        <p>Scan a table QR when you visit again.</p></section>`
      : screen === 'settings' ? `<section class="order-paper"><h1>Settings</h1>
        ${session ? `<h2>Account</h2><p>${esc(session.guest.name)}<br>${esc(session.guest.email)}</p>` : ''}
        <h2>Order alerts</h2><label class="settings-check"><input type="checkbox" id="order-sound" ${sound ? 'checked' : ''}> Play an alert when the waiter is on the way</label>
        ${native ? button('signout', 'Sign out') : ''}</section>`
      : order ? ticket() : demoMode() ? demoMenu({
        items:selection(), reservation:reservationCard(), title:table?.venue_name || 'Served Kitchen',
        category, payment:demoPayment, quantities,
        count:count(), total:total(), cartOpen, placed, button, esc, money, listItems,
      }) : table ? menuCard() : landing();
    app.innerHTML = `<main class="guest order-app${screen === 'feed' && !order && demoMode() ? ' demo-app' : ''}">
      <header class="order-header"><a href="${url({ shell:'guest', ...(native ? { native:'1' } : {}) })}" aria-label="Served home"><img src="/served-logo.png" alt="Served" width="88" height="36"></a></header>
      <div class="order-content">${issue ? `<p class="order-error" role="status">${esc(issue)}</p>` : ''}${content}</div>
      <nav class="order-tabs" aria-label="Guest navigation">${tabs.map(([key, glyph, title]) =>
        `<button type="button" data-order-action="tab" data-value="${key}" ${screen === key ? 'aria-current="page"' : ''}>${icon(glyph, 19)}<span>${title}</span></button>`).join('')}</nav>
      </main>`;
    if (focus) [...app.querySelectorAll('[data-order-action]')].find(el =>
      el.dataset.orderAction === focus.orderAction && el.dataset.value === focus.value)?.focus({ preventScroll:true });
  }

  function resetMenu(id = null) {
    table = order = orderId = checkoutId = placed = null;
    tableId = id;
    quantities = {};
    demoOnly = id === 'demo' || id === demoMenuCode;
    category = 'All';
    cartOpen = demoPayment = false;
    issue = '';
    screen = 'feed';
  }

  async function fetchMenu(id, keepCart = false) {
    const attempt = ++menuRequest;
    if (id === 'demo' || id === demoMenuCode) {
      resetMenu(id);
      render();
      return;
    }
    if (!validId(id)) throw new Error('Enter a valid Served menu link.');
    const menu = await api('menus/' + id);
    if (attempt !== menuRequest) return;
    const reservation = menu.general ? null : await reservationCall(menu.id, { check:true });
    if (attempt !== menuRequest) return;
    const cart = keepCart && table?.general && table.venue_id === menu.venue_id
      ? Object.fromEntries(menu.items.filter(item => quantities[item.id]).map(item => [item.id, quantities[item.id]])) : {};
    resetMenu(menu.id);
    table = { ...menu, reservation };
    quantities = cart;
    const shops = [{ id:menu.venue_id, name:menu.venue_name, date:Date.now() }, ...saved('visitedShops').filter(shop => shop.id !== menu.venue_id)];
    store('visitedShops', shops);
    if (native && !menu.general) api('menus/' + menu.id + '/visit', token(), 'POST', {}).catch(() => {});
    render();
  }

  async function showOrder(id, verify = false) {
    const candidate = await api(`orders/${id}${verify ? '/verify' : ''}`, token(), verify ? 'POST' : 'GET', verify ? {} : undefined);
    ++menuRequest;
    order = candidate;
    orderId = candidate.id;
    rememberOrder(candidate);
    screen = 'feed';
    render();
  }

  async function sync() {
    if (!order || screen !== 'feed' || document.hidden || syncBusy || loading || order.status === 'delivered') return;
    syncBusy = true;
    const id = order.id;
    const verify = refreshTicket && order.status === 'pending';
    refreshTicket = false;
    try {
      const next = await api(`orders/${id}${verify ? '/verify' : ''}`, token(), verify ? 'POST' : 'GET', verify ? {} : undefined);
      if (order?.id !== id || next.updated_at < order.updated_at || next.status === order.status) return;
      if (next.status === 'ready') {
        if (native && sound) send('ready');
        else ring();
      }
      order = next;
      if (screen === 'feed') render();
    } catch { /* Keep the last ticket visible and retry on the next poll. */ }
    finally { syncBusy = false; }
  }

  async function openPayment() {
    if (!order?.payment_url) return;
    if (native) send('pay', order.payment_url);
    else location.assign(order.payment_url);
  }

  async function start() {
    if (!sessionLoaded) return render();
    try {
      issue = '';
      if (validId(orderId)) await showOrder(orderId, params.get('payment') === 'return');
      else if (tableId) await fetchMenu(tableId);
      else if (demoOnly) render();
      else {
        const history = native ? await api('orders', token()) : [];
        const last = native ? history.find(candidate => candidate.status !== 'delivered')?.id || history[0]?.id : saved('foodOrders')[0];
        if (table || order) return;
        if (validId(last)) await showOrder(last);
        else render();
      }
    } catch (problem) {
      issue = problem.message;
      render();
    }
  }

  app.addEventListener('click', async event => {
    const control = event.target.closest('[data-order-action]');
    if (!control || loading) return;
    const action = control.dataset.orderAction, value = control.dataset.value;
    try {
      issue = '';
      if (action === 'tab') {
        screen = value;
        if (value === 'history') {
          historyList = native ? await api('orders', token()) : (await Promise.allSettled(saved('foodOrders').slice(0,20).map(id => api('orders/' + id))))
            .filter(entry => entry.status === 'fulfilled').map(entry => entry.value);
        }
        if (value === 'shops' && native) accountShops = await api('orders/shops', token());
        render(control.dataset);
      } else if (action === 'demo-menu') {
        await fetchMenu(demoMenuCode);
      } else if (action === 'select-table') {
        await fetchMenu(value, true);
        app.querySelector('#order-checkout')?.scrollIntoView({ block:'start' });
      } else if (action === 'reserve-table' || action === 'release-table') {
        const current = table;
        const prior = current.reservation;
        control.disabled = true;
        try {
          if (action === 'release-table') {
            await reservationCall(current.id, { release:true });
            current.reservation = { busy:false };
          } else {
            current.reservation = await reservationCall(current.id, {});
          }
        } catch (failure) {
          current.reservation = await reservationCall(current.id, { check:true }).catch(() => prior);
          if (current.reservation?.busy) {
            const fresh = await api('menus/' + current.id).catch(() => null);
            if (fresh) current.alternatives = fresh.alternatives;
          }
          throw failure;
        }
        render(control.dataset);
      } else if (action === 'demo-category') {
        category = value;
        render(control.dataset);
      } else if (action === 'demo-cart') {
        cartOpen = !cartOpen;
        demoPayment = false;
        render();
        window.scrollTo(0, 0);
      } else if (action === 'demo-payment' && cartOpen && count()) {
        demoPayment = !demoPayment;
        render();
      } else if (action === 'demo-place' && demoMode() && demoPayment && count()) {
        placed = {
          number:crypto.randomUUID().slice(0, 5).toUpperCase(),
          items:selection().filter(item => quantities[item.id]).map(item => ({ ...item, quantity:quantities[item.id] })),
          total:total(),
        };
        quantities = {};
        cartOpen = demoPayment = false;
        render();
        window.scrollTo(0, 0);
      } else if (action === 'demo-return') {
        placed = null;
        render();
      } else if (action === 'plus' || action === 'minus') {
        const form = app.querySelector('#order-checkout');
        if (form?.elements.name) savedName = form.elements.name.value;
        if (form?.elements.email) savedEmail = form.elements.email.value;
        const amount = Math.min(20, Math.max(0, (quantities[value] || 0) + (action === 'plus' ? 1 : -1)));
        if (amount) quantities[value] = amount;
        else delete quantities[value];
        checkoutId = null;
        render(control.dataset);
      } else if (action === 'open-order') await showOrder(value);
      else if (action === 'verify') await showOrder(order.id, true);
      else if (action === 'enable-sound') {
        if (typeof AudioContext !== 'function') throw new Error('Sound is not supported in this browser.');
        audio ||= new AudioContext();
        await audio.resume();
        render();
      }
      else if (action === 'pay') await openPayment();
      else if (action === 'received') {
        order = await api('orders/' + order.id + '/received', token(), 'POST', {});
        render();
      } else if (action === 'scan') send('scan');
      else if (action === 'signout') send('signout');
      else if (action === 'new-order') {
        ++menuRequest;
        resetMenu();
        history.replaceState(null, '', url({ shell:'guest', ...(native ? { native:'1' } : {}) }));
        render();
        if (native) send('scan');
      }
    } catch (problem) { issue = problem.message; render(); }
  });
  app.addEventListener('change', event => {
    if (event.target.id !== 'order-sound') return;
    sound = event.target.checked;
    localStorage.setItem('served.orderSound', sound ? 'on' : 'off');
    if (sound && !native && typeof AudioContext === 'function') {
      audio ||= new AudioContext();
      audio.resume().catch(() => {});
    }
  });
  app.addEventListener('submit', async event => {
    if (!['order-link','order-checkout'].includes(event.target.id)) return;
    event.preventDefault();
    if (loading) return;
    const values = new FormData(event.target);
    try {
      issue = '';
      if (event.target.id === 'order-link') {
        const target = new URL(values.get('link'));
        const id = target.searchParams.get('table') || target.searchParams.get('venue') ||
          (target.searchParams.has('demo-menu') ? demoMenuCode : null);
        if (target.origin !== location.origin || target.pathname !== '/' || target.searchParams.has('waitlist') || !id) {
          throw new Error('Enter a valid Served menu link.');
        }
        await fetchMenu(id);
      } else {
        savedName = values.get('name') || '';
        savedEmail = values.get('email') || '';
        loading = true;
        render();
        checkoutId ||= crypto.randomUUID().replaceAll('-', '');
        const candidate = await api('menus/' + table.id + '/checkout', token(), 'POST', {
          id: checkoutId, holder:holder(), name: savedName, email: savedEmail, quantities, expected_total: total(),
        });
        order = candidate;
        orderId = order.id;
        rememberOrder(order);
        history.replaceState(null, '', url({ order:order.id, ...(native ? { native:'1' } : {}) }));
        await openPayment();
      }
    } catch (problem) { issue = problem.message; }
    finally { loading = false; render(); }
  });
  if (native) {
    window.addEventListener('served-session', event => {
      if (sessionLoaded) return;
      session = event.detail;
      sessionLoaded = true;
      start();
    });
    window.addEventListener('served-foreground', () => { refreshTicket = true; sync(); });
    window.addEventListener('served-order', event => showOrder(event.detail).catch(problem => { issue = problem.message; render(); }));
    window.addEventListener('served-table', event => fetchMenu(event.detail).catch(problem => { issue = problem.message; render(); }));
    send('ready-for-session');
  }
  start();
  setInterval(sync, 4000);
}

export function staffOrdering(app, venueConfig, { notice, modal }) {
  let view = 'queue';
  let state;
  let editing;
  let requestBusy = false;
  let problem = '';
  const isActive = () => Boolean(app.querySelector('#staff-ordering'));
  const call = (endpoint = '', method = 'GET', data) => api(
    'ordering/' + venueConfig.venue.id + endpoint, venueConfig.staffToken, method, data,
  );

  function queue() {
    if (!state.orders.length) return '<p class="order-empty">Verified orders will appear here.</p>';
    const transitions = { paid:['preparing','Start preparing'], preparing:['ready','Ready for waiter'], ready:['delivered','Mark delivered'] };
    return state.orders.map(order => {
      const action = transitions[order.status];
      return `<article class="kitchen-ticket">
        <div class="kitchen-heading"><h3>${orderNumber(order.number)} · ${esc(order.table_label)}</h3><span>${statuses[order.status][0]}</span></div>
        <p>${esc(order.guest_name)} · ${money(order.total)}</p>${listItems(order.items)}
        ${action ? button('staff-stage', action[1], 'primary', order.id + ':' + action[0]) : ''}</article>`;
    }).join('');
  }

  function menu() {
    const published = state.items.some(item => item.available);
    const items = published ? state.items : demoItems;
    const groups = published ? ['Restaurant menu'] : menuCategories(items);
    return `<section class="staff-catalog">
      <h2>${published ? 'Restaurant menu' : 'Demo menu'} <small>${items.length} items</small></h2>
      <a class="btn" href="${url({ table:venueConfig.venue.id })}" target="_blank" rel="noopener">Open guest menu</a>
      ${groups.map(group => `<section><h3>${esc(group)}</h3>
        <ul>${items.filter(item => published || item.category === group).map(item =>
          `<li><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p>
            ${published && !item.available ? '<p>Hidden from guests</p>' : ''}</div><strong>${money(item.price)}</strong>
            ${published ? button('staff-edit', 'Edit', '', item.id) : ''}</li>`).join('')}</ul></section>`).join('')}
    </section>
    <details class="staff-menu-editor" ${editing ? 'open' : ''}><summary>Manage custom items</summary>
      <form id="staff-menu" class="staff-order-form">
      <h2>${editing ? 'Edit menu item' : 'Add custom menu item'}</h2>
      <label>Name <input name="name" maxlength="80" required value="${esc(editing?.name)}"></label>
      <label>Description <input maxlength="160" name="description" value="${esc(editing?.description)}"></label>
      <label>Price in rand <input type="number" name="price" min="1" max="10000" step="0.01" required value="${editing ? (editing.price / 100).toFixed(2) : ''}"></label>
      <label class="settings-check"><input type="checkbox" name="available" ${editing?.available === 0 ? '' : 'checked'}> Available on menu</label>
      <button class="btn primary">Save item</button>${editing ? button('staff-clear', 'Cancel edit') : ''}
    </form>${published ? '' : state.items.map(item => `<p>${esc(item.name)} · Hidden ${button('staff-edit', 'Edit', '', item.id)}</p>`).join('')}</details>`;
  }

  function tables() {
    return `<form id="staff-table" class="staff-order-form"><h2>Add a table</h2>
      <label>Table label <input name="label" maxlength="32" required placeholder="Table 5"></label>
      <button class="btn primary">Create table QR</button></form>
      <div>${state.tables.map(table => `<div class="order-line"><div><strong>${esc(table.label)}</strong><p data-table-status="${table.id}">${table.occupied ? 'Occupied' : 'Available'}</p></div>
        ${button('staff-qr', 'View QR', '', table.id)}<a class="btn" href="${url({ table:table.id })}" target="_blank" rel="noopener">Open menu</a></div>`).join('')}</div>`;
  }

  function render() {
    const target = app.querySelector('#staff-ordering');
    if (!target) return;
    if (!state) {
      target.innerHTML = problem ? `<p role="alert">${esc(problem)}</p>${button('staff-retry', 'Retry')}` : '<p class="order-empty">Loading restaurant orders…</p>';
      return;
    }
    target.innerHTML = `<div class="staff-order-nav" aria-label="Restaurant ordering">
      ${[['queue','Kitchen queue'], ['menu','Menu'], ['tables','Table QR']].map(([id, label]) =>
        button('staff-view', label, id === view ? 'primary' : '', id)).join('')}
      </div>
      ${!state.payment_available ? '<p class="order-empty">Demo checkout is available without a charge.</p>' : ''}
      ${problem ? `<p class="order-empty" role="alert">${esc(problem)}</p>` : ''}
      <div class="staff-order-content">${view === 'queue' ? queue() : view === 'menu' ? menu() : tables()}</div>`;
  }

  async function refresh() {
    if (!isActive() || requestBusy || document.hidden) return;
    requestBusy = true;
    try {
      const next = await call();
      const changed = !state || JSON.stringify(next) !== JSON.stringify(state);
      state = next;
      if (changed || problem) {
        problem = '';
        if (view === 'queue' || !app.querySelector('#staff-ordering form')) render();
        else if (view === 'tables') {
          for (const table of state.tables) {
            const status = app.querySelector(`[data-table-status="${table.id}"]`);
            if (status) status.textContent = table.occupied ? 'Occupied' : 'Available';
          }
        }
      }
    } catch (failure) {
      if (!state) {
        problem = failure.message;
        render();
      }
    } finally { requestBusy = false; }
  }

  async function showQr(table) {
    const destination = location.origin + url({ table:table.id });
    const image = await QRCode.toDataURL(destination, { width:400, margin:3 });
    modal('QR · ' + esc(table.label), `<p class="dialog-copy">Guests scan this code to order at ${esc(table.label)}.</p>
      <img class="qr-image" src="${image}" width="240" height="240" alt="QR code for ${esc(table.label)}">
      <a class="btn primary" href="${image}" download="served-table-qr.png">Download QR</a>
      <p><a href="${esc(destination)}" target="_blank" rel="noopener">Open guest menu</a></p>`);
  }

  app.addEventListener('click', async event => {
    const control = event.target.closest('#staff-ordering [data-order-action]');
    if (!control || control.disabled) return;
    const action = control.dataset.orderAction, value = control.dataset.value;
    control.disabled = true;
    try {
      problem = '';
      if (action === 'staff-view') { view = value; editing = null; render(); }
      if (action === 'staff-edit') { editing = state.items.find(item => item.id === value); render(); }
      if (action === 'staff-clear') { editing = null; render(); }
      if (action === 'staff-qr') await showQr(state.tables.find(table => table.id === value));
      if (action === 'staff-retry') await refresh();
      if (action === 'staff-stage') {
        const [id, status] = value.split(':');
        await call('/order', 'PATCH', { id, status });
        state = await call();
        render();
      }
    } catch (failure) {
      notice(failure.message);
    } finally { control.disabled = false; }
  });

  app.addEventListener('submit', async event => {
    const form = event.target;
    if (!['staff-menu','staff-table'].includes(form.id)) return;
    event.preventDefault();
    const submit = form.querySelector('button:not([type])');
    if (submit.disabled) return;
    submit.disabled = true;
    const values = new FormData(form);
    try {
      if (form.id === 'staff-menu') {
        await call('/menu', 'POST', {
          id: editing?.id, name: values.get('name'), description: values.get('description'),
          price: Math.round(Number(values.get('price')) * 100), available: values.has('available'),
        });
        editing = null;
        notice('Menu item saved');
      } else {
        const table = await call('/table', 'POST', { label: values.get('label') });
        await showQr(table);
      }
      state = await call();
      render();
    } catch (failure) {
      notice(failure.message);
    } finally { submit.disabled = false; }
  });
  setInterval(refresh, 4000);
  return { render, refresh };
}
