/**
 * Pizza Pricing Utilities (MenuItems schemaVersion 2)
 * 
 * Defines the pizza schema structure and provides pricing calculation helpers.
 * Used by createOrder lambda for server-side pricing and by seed scripts.
 */

// =============================================================================
// SCHEMA VERSION 2 PIZZA STRUCTURE
// =============================================================================

/**
 * Example V2 Pizza MenuItem structure:
 * {
 *   itemId: "pizza-byo",
 *   schemaVersion: 2,
 *   kind: "pizza",
 *   
 *   // Base product info
 *   name: "Build Your Own Pizza",
 *   description: "Choose your size, crust, and toppings",
 *   category: "Pizza",
 *   image: "",
 *   available: true,
 *   sortOrder: 1,
 *   
 *   // Allowed option groups
 *   allowedSizes: ["Personal", "Small", "Medium", "Large"],
 *   allowedCrusts: ["Thin", "Regular", "Double", "Stuffed", "Gluten-Free"],
 *   allowedToppings: ["Pepperoni", "Sausage", "Mushrooms", "Onions", ...],
 *   allowedModifiers: ["well-done", "extra cheese", "light sauce", "extra sauce"],
 *   
 *   // Pricing rules (all in cents for precision)
 *   pricingRules: {
 *     basePriceCentsBySize: { Personal: 1199, Small: 1499, Medium: 1799, Large: 2099 },
 *     toppingPriceCentsBySize: { Personal: 100, Small: 150, Medium: 250, Large: 350 },
 *     crustSurchargeCentsByCrust: { Thin: 0, Regular: 0, Double: 200, Stuffed: 200, "Gluten-Free": 0 },
 *     glutenFreeBaseCents: 1600,
 *     glutenFreeAllowedSizes: ["Small"],
 *     halfToppingCountsAsWhole: true,
 *     portionMultipliers: { regular: 1, light: 1, extra: 2, no: 0 },
 *     extraCheeseCountsAsTopping: true,
 *   },
 *   
 *   // Constraints
 *   constraints: {
 *     maxToppings: 10,
 *     allowedCrustsBySizes: null, // null = all crusts for all sizes
 *   },
 *   
 *   // Multi-tenant
 *   restaurantId: "demo123",
 *   createdAt: "...",
 *   updatedAt: "...",
 * }
 */

// =============================================================================
// DEFAULT PRICING CONFIGURATION
// =============================================================================

export const DEFAULT_PIZZA_PRICING = {
  basePriceCentsBySize: {
    Personal: 1199,
    Small: 1499,
    Medium: 1799,
    Large: 2099,
  },
  toppingPriceCentsBySize: {
    Personal: 100,
    Small: 150,
    Medium: 250,
    Large: 350,
  },
  crustSurchargeCentsByCrust: {
    Thin: 0,
    Regular: 0,
    Double: 200,
    Stuffed: 200,
    "Gluten-Free": 0, // GF uses glutenFreeBaseCents instead
  },
  glutenFreeBaseCents: 1600,
  glutenFreeAllowedSizes: ["Small"],
  halfToppingCountsAsWhole: true,
  portionMultipliers: {
    regular: 1,
    light: 1,
    extra: 2,
    no: 0,
  },
  extraCheeseCountsAsTopping: true,
};

export const DEFAULT_ALLOWED_SIZES = ["Personal", "Small", "Medium", "Large"];
export const DEFAULT_ALLOWED_CRUSTS = ["Thin", "Regular", "Double", "Stuffed", "Gluten-Free"];
export const DEFAULT_ALLOWED_TOPPINGS = [
  "Pepperoni", "Sausage", "Italian Sausage", "Bacon", "Ham", "Chicken",
  "Mushrooms", "Onions", "Green Peppers", "Black Olives", "Green Olives",
  "Jalapeños", "Banana Peppers", "Tomatoes", "Spinach", "Pineapple",
  "Anchovies", "Extra Cheese",
];
export const DEFAULT_ALLOWED_MODIFIERS = ["well-done", "light sauce", "extra sauce", "no sauce"];

// =============================================================================
// TOPPING PARSING
// =============================================================================

/**
 * Parse a topping string that may have portion tags.
 * e.g., "Pepperoni|extra" -> { name: "Pepperoni", portion: "extra" }
 *       "Mushrooms|light" -> { name: "Mushrooms", portion: "light" }
 *       "Sausage"         -> { name: "Sausage", portion: "regular" }
 */
export function parseTopping(toppingInput) {
  // Handle object input (already parsed)
  if (toppingInput && typeof toppingInput === 'object') {
    return {
      name: String(toppingInput.name || ''),
      portion: String(toppingInput.portion || 'regular'),
    };
  }
  
  // Handle string input
  if (!toppingInput || typeof toppingInput !== 'string') {
    return { name: String(toppingInput || ''), portion: 'regular' };
  }
  
  const parts = toppingInput.split('|');
  const name = parts[0].trim();
  let portion = 'regular';
  
  for (let i = 1; i < parts.length; i++) {
    const tag = parts[i].toLowerCase().trim();
    if (tag === 'extra') portion = 'extra';
    else if (tag === 'light') portion = 'light';
    else if (tag === 'no') portion = 'no';
  }
  
  return { name, portion };
}

// =============================================================================
// PIZZA PRICING CALCULATION
// =============================================================================

/**
 * Calculate the price of a pizza in cents based on menu item pricing rules.
 * 
 * @param {Object} pizzaDetails - The customer's pizza choices
 * @param {string} pizzaDetails.size - Size (Personal, Small, Medium, Large)
 * @param {string} pizzaDetails.crust - Crust type (Thin, Regular, etc.)
 * @param {Array} pizzaDetails.wholeToppings - Toppings on whole pizza
 * @param {Array} pizzaDetails.leftHalfToppings - Toppings on left half
 * @param {Array} pizzaDetails.rightHalfToppings - Toppings on right half
 * @param {Array} pizzaDetails.modifiers - Modifiers like "well-done", "extra cheese"
 * @param {Object} pricingRules - The menu item's pricing rules
 * @returns {Object} - { baseCents, crustSurcharge, toppingsCents, totalCents, breakdown }
 */
export function calculatePizzaPriceCents(pizzaDetails, pricingRules = DEFAULT_PIZZA_PRICING) {
  const size = pizzaDetails.size || 'Medium';
  const crust = pizzaDetails.crust || 'Thin';
  const rules = { ...DEFAULT_PIZZA_PRICING, ...pricingRules };
  
  // Base price
  let baseCents = rules.basePriceCentsBySize?.[size] || rules.basePriceCentsBySize?.Medium || 1799;
  let crustSurcharge = rules.crustSurchargeCentsByCrust?.[crust] || 0;
  
  // Special handling for Gluten-Free
  if (crust === 'Gluten-Free') {
    baseCents = rules.glutenFreeBaseCents || 1600;
    crustSurcharge = 0;
    // Optionally warn if not allowed size, but still charge
    if (rules.glutenFreeAllowedSizes && !rules.glutenFreeAllowedSizes.includes(size)) {
      console.warn(`[Pizza Pricing] Gluten-Free crust on ${size} - typically only allowed for ${rules.glutenFreeAllowedSizes.join(', ')}`);
    }
  }
  
  // Topping price per item for this size
  const toppingPricePerItem = rules.toppingPriceCentsBySize?.[size] || rules.toppingPriceCentsBySize?.Medium || 250;
  const portionMultipliers = rules.portionMultipliers || DEFAULT_PIZZA_PRICING.portionMultipliers;
  
  // Calculate topping cost
  const addToppingCost = (toppingInput) => {
    const parsed = parseTopping(toppingInput);
    const multiplier = portionMultipliers[parsed.portion] ?? 1;
    return Math.round(toppingPricePerItem * multiplier);
  };
  
  let toppingsCents = 0;
  const toppingBreakdown = [];
  
  // Whole toppings
  const wholeToppings = pizzaDetails.wholeToppings || [];
  for (const t of wholeToppings) {
    const cost = addToppingCost(t);
    toppingsCents += cost;
    const parsed = parseTopping(t);
    toppingBreakdown.push({ topping: parsed.name, portion: parsed.portion, location: 'whole', cents: cost });
  }
  
  // Half toppings - charged as full toppings per the plan
  const leftHalfToppings = pizzaDetails.leftHalfToppings || [];
  for (const t of leftHalfToppings) {
    const cost = addToppingCost(t);
    toppingsCents += cost;
    const parsed = parseTopping(t);
    toppingBreakdown.push({ topping: parsed.name, portion: parsed.portion, location: 'left', cents: cost });
  }
  
  const rightHalfToppings = pizzaDetails.rightHalfToppings || [];
  for (const t of rightHalfToppings) {
    const cost = addToppingCost(t);
    toppingsCents += cost;
    const parsed = parseTopping(t);
    toppingBreakdown.push({ topping: parsed.name, portion: parsed.portion, location: 'right', cents: cost });
  }
  
  // Check modifiers for extra charges
  const modifiers = pizzaDetails.modifiers || [];
  let modifiersCents = 0;
  
  for (const mod of modifiers) {
    const modLower = (typeof mod === 'string' ? mod : '').toLowerCase().trim();
    // Extra cheese counts as a topping
    if (modLower === 'extra cheese' && rules.extraCheeseCountsAsTopping) {
      const cost = toppingPricePerItem;
      modifiersCents += cost;
      toppingBreakdown.push({ topping: 'Extra Cheese', portion: 'modifier', location: 'whole', cents: cost });
    }
    // well-done, light sauce, etc. are free
  }
  
  toppingsCents += modifiersCents;
  
  const totalCents = baseCents + crustSurcharge + toppingsCents;
  
  return {
    baseCents,
    crustSurcharge,
    toppingsCents,
    totalCents,
    breakdown: {
      size,
      crust,
      baseCents,
      crustSurcharge,
      toppings: toppingBreakdown,
      totalToppingsCents: toppingsCents,
    },
  };
}

/**
 * Check if a menu item is a v2 pizza item
 */
export function isPizzaMenuItem(menuItem) {
  return menuItem?.schemaVersion === 2 && menuItem?.kind === 'pizza';
}

/**
 * Validate required fields for a v2 pizza menu item
 */
export function validatePizzaMenuItem(item) {
  const errors = [];
  
  if (item.schemaVersion !== 2) {
    errors.push('schemaVersion must be 2 for pizza items');
  }
  
  if (item.kind !== 'pizza') {
    errors.push('kind must be "pizza" for pizza items');
  }
  
  if (!item.name || typeof item.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  
  if (!item.pricingRules || typeof item.pricingRules !== 'object') {
    errors.push('pricingRules object is required');
  } else {
    if (!item.pricingRules.basePriceCentsBySize || typeof item.pricingRules.basePriceCentsBySize !== 'object') {
      errors.push('pricingRules.basePriceCentsBySize is required');
    }
    if (!item.pricingRules.toppingPriceCentsBySize || typeof item.pricingRules.toppingPriceCentsBySize !== 'object') {
      errors.push('pricingRules.toppingPriceCentsBySize is required');
    }
  }
  
  if (!item.allowedSizes || !Array.isArray(item.allowedSizes) || item.allowedSizes.length === 0) {
    errors.push('allowedSizes array is required and must not be empty');
  }
  
  if (!item.allowedCrusts || !Array.isArray(item.allowedCrusts) || item.allowedCrusts.length === 0) {
    errors.push('allowedCrusts array is required and must not be empty');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a default "Build Your Own Pizza" menu item
 */
export function createDefaultPizzaMenuItem(restaurantId) {
  return {
    itemId: 'pizza-byo',
    schemaVersion: 2,
    kind: 'pizza',
    
    // Base product info
    name: 'Build Your Own Pizza',
    description: 'Choose your size, crust, and toppings to create your perfect pizza',
    category: 'Pizza',
    image: '',
    available: true,
    sortOrder: 1,
    
    // Allowed option groups
    allowedSizes: DEFAULT_ALLOWED_SIZES,
    allowedCrusts: DEFAULT_ALLOWED_CRUSTS,
    allowedToppings: DEFAULT_ALLOWED_TOPPINGS,
    allowedModifiers: DEFAULT_ALLOWED_MODIFIERS,
    
    // Pricing rules
    pricingRules: { ...DEFAULT_PIZZA_PRICING },
    
    // Constraints
    constraints: {
      maxToppings: 10,
      allowedCrustsBySizes: null, // All crusts allowed for all sizes
    },
    
    // Multi-tenant
    restaurantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}




