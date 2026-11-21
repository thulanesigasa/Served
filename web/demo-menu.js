import { menuCategories } from './menu-catalog.js';
import { icon } from './icons.js';

export function demoMenu({ items, reservation, title, category, payment, quantities, count, total, cartOpen, button, esc, money }) {
  const featured = items.find(item => item.id === 'chicken');
  const visible = category === 'All' ? items : items.filter(item => item.category === category);
  const lines = items.filter(item => quantities[item.id]).map(item => ({ ...item, quantity:quantities[item.id] }));
  const quantity = item => `<div class="demo-quantity">${quantities[item.id] ? button('minus', '<span aria-hidden="true">−</span><span class="order-sr">Remove ' + esc(item.name) + '</span>', '', item.id) + '<span>' + quantities[item.id] + '</span>' : ''}
    ${button('plus', '<span aria-hidden="true">+</span><span class="order-sr">Add ' + esc(item.name) + '</span>', '', item.id)}</div>`;
  if (cartOpen && count) {
    const back = payment ? button('demo-payment', 'Back to order') : button('demo-cart', 'Back to menu');
    return `<section class="demo-checkout" id="demo-cart">
      <div class="checkout-heading">
        ${back}
        <h1>${payment ? 'Payment' : 'Review your order'}</h1>
        <ol class="checkout-steps" aria-label="Checkout progress">
          <li ${payment ? 'class="is-done"' : 'aria-current="step"'}><span>${payment ? icon('check', 14) : '1'}</span>Order review</li>
          <li ${payment ? 'aria-current="step"' : ''}><span>2</span>Payment</li>
        </ol>
      </div>
      <div class="checkout-grid">
        <section class="checkout-items" aria-labelledby="checkout-items-title">
          <h2 id="checkout-items-title">Your items <span>${count}</span></h2>
          <ul>${lines.map(item => `<li class="checkout-item">
            ${item.photo ? `<img src="/demo/${esc(item.photo)}.webp" alt="" width="56" height="56">` : ''}
            <div class="checkout-item-details"><strong>${esc(item.name)}</strong>
              <span>${payment ? 'Qty ' + item.quantity : money(item.price) + ' each'}</span></div>
            <div class="checkout-item-price"><strong>${money(item.price * item.quantity)}</strong>
              ${payment ? '' : quantity(item)}</div>
          </li>`).join('')}</ul>
          ${payment ? `<div class="checkout-method"><h2>Payment method</h2>
            <div>${icon('card', 22)}<span><strong>Demo card payment</strong><br>No card details are required.</span>${icon('check', 18)}</div></div>` : ''}
        </section>
        <section class="checkout-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">Order summary</h2>
          <dl><div><dt>Subtotal</dt><dd>${money(total)}</dd></div>
            <div class="checkout-total"><dt>Total</dt><dd>${money(total)}</dd></div></dl>
          ${payment ? button('demo-place', 'Confirm demo payment', 'checkout-primary') :
            button('demo-payment', 'Continue to payment', 'checkout-primary')}
          <p>Demo checkout. You won’t be charged.</p>
        </section>
      </div>
    </section>`;
  }

  return `<section class="demo-menu">
    <div class="demo-intro"><p class="demo-kicker">Demo menu</p><h1>${esc(title)}</h1>
    <p>Browse ${items.length} items and try a demo checkout. You won’t be charged.</p></div>
    ${reservation}
    <nav class="demo-categories" aria-label="Menu categories">
      ${['All', ...menuCategories(items)].map(label =>
        `<button type="button" class="demo-category" data-order-action="demo-category" data-value="${esc(label)}" aria-pressed="${label === category}">${esc(label)}</button>`).join('')}
    </nav>
    ${category === 'All' && featured ? `<article class="demo-featured">
      <img src="/demo/chicken.webp" alt="" fetchpriority="high" width="620" height="620">
      <div class="demo-featured-copy"><p class="demo-kicker">House favourite</p>
      <h2>${featured.name}</h2><p>${featured.description}</p>
      ${button('plus', 'Add to order · ' + money(featured.price), 'demo-cta', featured.id)}</div>
    </article>` : ''}
    <h2 class="demo-section-title">${category === 'All' ? 'Explore the menu' : esc(category)}</h2>
    <div class="demo-grid">${visible.map(item => `<article class="demo-dish">
      ${item.photo ? `<img src="/demo/${item.photo}.webp" alt="" width="420" height="420" loading="lazy">` : ''}
      <div class="demo-dish-copy"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>
      <div class="demo-dish-footer"><strong>${money(item.price)}</strong>${quantity(item)}</div></div>
    </article>`).join('')}</div>
    ${count && !cartOpen ? `<div class="demo-cart-launch">${button('demo-cart', 'Review order (' + count + ') · ' + money(total), 'demo-cta')}</div>` : ''}
  </section>`;
}
