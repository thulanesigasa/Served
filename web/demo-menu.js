export const demoItems = [
  { id:'burger', name:'Double Smash Burger', category:'Burgers', price:8900, description:'Two smashed beef patties, melted cheddar, pickles and house sauce.' },
  { id:'chicken', name:'Hot Honey Chicken Combo', category:'Chicken', price:10900, description:'Crispy hot honey chicken, crunchy lettuce and a side of seasoned fries.' },
  { id:'pizza', name:'Pepperoni Pizza', category:'Pizza', price:11500, description:'Pepperoni, mozzarella and basil on a blistered crust.' },
  { id:'lemonade', name:'Berry Lemonade', category:'Drinks', price:3900, description:'Sparkling lemonade with muddled berries and fresh mint.' },
];

export function demoMenu({ reservation, title, category, quantities, count, total, cartOpen, placed, button, esc, money, listItems }) {
  const featured = demoItems[1];
  const visible = category === 'All' ? demoItems : demoItems.filter(item => item.category === category);
  const lines = demoItems.filter(item => quantities[item.id]).map(item => ({ ...item, quantity:quantities[item.id] }));
  const quantity = item => `<div class="demo-quantity">${quantities[item.id] ? button('minus', '<span aria-hidden="true">−</span><span class="order-sr">Remove ' + item.name + '</span>', '', item.id) + '<span>' + quantities[item.id] + '</span>' : ''}
    ${button('plus', '<span aria-hidden="true">+</span><span class="order-sr">Add ' + item.name + '</span>', '', item.id)}</div>`;
  if (placed) return `<section class="demo-receipt">
    <p class="demo-kicker">Demo ticket</p><h1>Order complete</h1>
    <p role="status">No charge was made. This order was for practice.</p>
    <p class="demo-ticket-number">Ticket #${esc(placed.number)}</p>
    ${listItems(placed.items)}
    <p class="order-total"><strong>Demo total</strong><strong>${money(placed.total)}</strong></p>
    ${button('demo-return', 'Back to menu', 'demo-cta')}
  </section>`;

  return `<section class="demo-menu">
    <div class="demo-intro"><p class="demo-kicker">Demo menu</p><h1>${esc(title)}</h1>
    <p>Try ordering from the menu. No payment is needed.</p></div>
    ${reservation}
    <nav class="demo-categories" aria-label="Menu categories">
      ${['All', 'Burgers', 'Chicken', 'Pizza', 'Drinks'].map(label =>
        `<button type="button" class="demo-category" data-order-action="demo-category" data-value="${label}" aria-pressed="${label === category}">${label}</button>`).join('')}
    </nav>
    ${category === 'All' ? `<article class="demo-featured">
      <img src="/demo/chicken.webp" alt="" fetchpriority="high" width="620" height="620">
      <div class="demo-featured-copy"><p class="demo-kicker">House favourite</p>
      <h2>${featured.name}</h2><p>${featured.description}</p>
      ${button('plus', 'Add to order · ' + money(featured.price), 'demo-cta', featured.id)}</div>
    </article>` : ''}
    <h2 class="demo-section-title">${category === 'All' ? 'Explore the menu' : category}</h2>
    <div class="demo-grid">${visible.map(item => `<article class="demo-dish">
      <img src="/demo/${item.id}.webp" alt="" width="420" height="420" loading="lazy">
      <div class="demo-dish-copy"><h3>${item.name}</h3><p>${item.description}</p>
      <div class="demo-dish-footer"><strong>${money(item.price)}</strong>${quantity(item)}</div></div>
    </article>`).join('')}</div>
    ${count ? `<section class="demo-cart" id="demo-cart" aria-label="Demo cart">
      ${cartOpen ? `<h2>Your demo order</h2>${listItems(lines)}
        ${button('demo-place', 'Place demo order · ' + money(total), 'demo-cta')}
        ${button('demo-cart', 'Continue browsing', 'demo-secondary')}`
        : button('demo-cart', 'Review order (' + count + ') · ' + money(total), 'demo-cta')}
    </section>` : ''}
  </section>`;
}
