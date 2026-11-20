const catalog = {
  Burgers: [
    ['burger', 'Double Smash Burger', 89, 'Two smashed beef patties, melted cheddar, pickles and house sauce.', 'burger'],
    ['classic-beef', 'Classic Beef Burger', 72, 'Grilled beef, lettuce, tomato, red onion and house sauce.'],
    ['bbq-bacon', 'BBQ Bacon Burger', 96, 'Smoky bacon, cheddar and barbecue sauce on a grilled beef patty.'],
    ['mushroom-swiss', 'Mushroom & Swiss Burger', 93, 'Grilled beef with sautéed mushrooms and melted Swiss cheese.'],
    ['peri-peri-burger', 'Peri-Peri Beef Burger', 92, 'Beef patty with peri-peri mayo, jalapeños and lettuce.'],
    ['garden-burger', 'Garden Burger', 79, 'Chickpea patty with tomato, cucumber and lemon mayo.'],
  ],
  Chicken: [
    ['chicken', 'Hot Honey Chicken Combo', 109, 'Crispy hot honey chicken with a side of seasoned fries.', 'chicken'],
    ['grilled-chicken', 'Lemon & Herb Chicken', 108, 'Grilled chicken breast with lemon, herbs and chips.'],
    ['peri-peri-wings', 'Peri-Peri Wings', 90, 'Six chicken wings tossed in peri-peri sauce.'],
    ['bbq-wings', 'Smoky BBQ Wings', 89, 'Six grilled wings glazed with smoky barbecue sauce.'],
    ['chicken-tenders', 'Crispy Chicken Tenders', 79, 'Five buttermilk tenders with ranch dip.'],
    ['chicken-wrap', 'Grilled Chicken Wrap', 79, 'Grilled chicken, lettuce, tomato and garlic mayo in a soft wrap.'],
  ],
  Pizza: [
    ['pizza', 'Pepperoni Pizza', 115, 'Pepperoni, mozzarella and basil on a blistered crust.', 'pizza'],
    ['margherita', 'Margherita Pizza', 95, 'Tomato, mozzarella and fresh basil.'],
    ['bbq-chicken-pizza', 'BBQ Chicken Pizza', 125, 'Barbecue chicken, red onion and mozzarella.'],
    ['roasted-veg-pizza', 'Roasted Vegetable Pizza', 110, 'Roasted peppers, mushrooms, onion and feta.'],
  ],
  Sides: [
    ['house-fries', 'House Fries', 35, 'Golden fries tossed with house seasoning.'],
    ['loaded-fries', 'Loaded Cheese Fries', 59, 'Fries topped with cheese sauce, spring onion and jalapeños.'],
    ['onion-rings', 'Buttermilk Onion Rings', 42, 'Crispy onion rings served with ranch dip.'],
    ['garden-salad', 'Garden Salad', 48, 'Mixed leaves, cucumber, cherry tomatoes and lemon dressing.'],
  ],
  Coffee: [
    ['espresso', 'Double Espresso', 28, 'A double shot of house espresso.'],
    ['americano', 'Americano', 32, 'Double espresso topped with hot water.'],
    ['cappuccino', 'Cappuccino', 39, 'Espresso, steamed milk and a thick layer of foam.'],
    ['flat-white', 'Flat White', 42, 'Double espresso with silky steamed milk.'],
    ['iced-vanilla-latte', 'Iced Vanilla Latte', 49, 'Espresso with chilled milk and vanilla over ice.'],
  ],
  Cocktails: [
    ['mojito', 'Classic Mojito', 82, 'White rum, mint, lime and soda.'],
    ['margarita', 'Lime Margarita', 88, 'Tequila, orange liqueur and lime with a salted rim.'],
    ['paloma', 'Grapefruit Paloma', 89, 'Tequila, pink grapefruit soda and lime.'],
    ['espresso-martini', 'Espresso Martini', 95, 'Vodka, coffee liqueur and fresh espresso.'],
    ['berry-gin', 'Berry Gin Fizz', 92, 'Gin, blackberry, lemon and sparkling water.'],
  ],
  Mocktails: [
    ['virgin-mojito', 'Mint & Lime Cooler', 52, 'Mint, lime and soda over crushed ice.'],
    ['ginger-mule', 'Pineapple Ginger Mule', 56, 'Pineapple, lime and ginger beer.'],
    ['tropical-spritz', 'Passion Fruit Spritz', 55, 'Passion fruit, orange and sparkling water.'],
    ['rooibos-cooler', 'Peach Rooibos Cooler', 49, 'Cold rooibos, peach and lemon.'],
  ],
  Lemonades: [
    ['lemonade', 'Berry Lemonade', 39, 'Sparkling lemonade with muddled berries and mint.', 'lemonade'],
    ['classic-lemonade', 'Classic Lemonade', 35, 'Fresh lemon, cane sugar and sparkling water.'],
    ['cucumber-lemonade', 'Cucumber Mint Lemonade', 42, 'Lemonade with cucumber slices and fresh mint.'],
    ['mango-lemonade', 'Mango Lemonade', 45, 'Mango and fresh lemon over ice.'],
  ],
  'Cold drinks': [
    ['cola', 'Cola', 28, 'Chilled cola served over ice.'],
    ['sparkling-water', 'Sparkling Water', 26, 'Chilled sparkling mineral water.'],
  ],
};

export const demoItems = Object.entries(catalog).flatMap(([category, items]) =>
  items.map(([id, name, rand, description, photo]) => ({
    id, name, category, price:rand * 100, description, photo,
  })),
);

export function menuCategories(items) {
  return [...new Set(items.map(item => item.category).filter(Boolean))];
}
