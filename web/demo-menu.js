import { menuCategories } from './menu-catalog.js';

export function demoMenu({ items, reservation, title, category, payment, quantities, count, total, cartOpen, button, esc, money, listItems }) {
  const featured = items.find(item => item.id === 'chicken');
  const visible = category === 'All' ? items : items.filter(item => item.category === category);
  const lines = items.filter(item => quantities[item.id]).map(item => ({ ...item, quantity:quantities[item.id] }));
  const quantity = item => `<div class="demo-quantity">${quantities[item.id] ? button('minus', '<span aria-hidden="true">−</span><span class="order-sr">Remove ' + esc(item.name) + '</span>', '', item.id) + '<span>' + quantities[item.id] + '</span>' : ''}
    ${button('plus', '<span aria-hidden="true">+</span><span class="order-sr">Add ' + esc(item.name) + '</span>', '', item.id)}</div>`;
  if (cartOpen && count) return `<section class="demo-receipt" id="demo-cart">
    <p class="demo-kicker">Demo checkout</p>
    <h1>${payment ? 'Demo payment' : 'Review your order'}</h1>
    ${listItems(lines)}
    <p class="order-total"><strong>Total</strong><strong>${money(total)}</strong></p>
    ${payment ? `<p>Simulated card payment. No card details or money are required.</p>
      ${button('demo-place', 'Confirm demo payment', 'demo-cta')}
      ${button('demo-payment', 'Back to order', 'demo-secondary')}`
      : button('demo-payment', 'Continue to payment', 'demo-cta') +
        button('demo-cart', 'Continue browsing', 'demo-secondary')}
  </section>`;

  return `<section class="demo-menu">
    <div class="demo-intro"><p class="demo-kicker">Demo menu</p><h1>${esc(title)}</h1>
    <p>Browse ${items.length} items and try a demo checkout. You won’t be charged.</p></div>
    ${reservation}
    <nav class="demo-categories" aria-label="Menu categories">
      ${['All', ...menuCategories(items)].map(label =>
        `<button type="button" class="demo-category" data-order-action="demo-category" data-value="${label}" aria-pressed="${label === category}">${label}</button>`).join('')}
    </nav>
    ${category === 'All' && featured ? `<article class="demo-featured">
      <img src="/demo/chicken.webp" alt="" fetchpriority="high" width="620" height="620">
      <div class="demo-featured-copy"><p class="demo-kicker">House favourite</p>
      <h2>${featured.name}</h2><p>${featured.description}</p>
      ${button('plus', 'Add to order · ' + money(featured.price), 'demo-cta', featured.id)}</div>
    </article>` : ''}
    <h2 class="demo-section-title">${category === 'All' ? 'Explore the menu' : category}</h2>
    <div class="demo-grid">${visible.map(item => `<article class="demo-dish">
      ${item.photo ? `<img src="/demo/${item.photo}.webp" alt="" width="420" height="420" loading="lazy">` : ''}
      <div class="demo-dish-copy"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>
      <div class="demo-dish-footer"><strong>${money(item.price)}</strong>${quantity(item)}</div></div>
    </article>`).join('')}</div>
    ${count && !cartOpen ? `<div class="demo-cart-launch">${button('demo-cart', 'Review order (' + count + ') · ' + money(total), 'demo-cta')}</div>` : ''}
  </section>`;
}
