import React, { useState, useEffect, useMemo } from 'react';
import './PizzaCustomizerModal.css';

/**
 * Calculate pizza price from pizzaDetails and pricingRules (client-side preview).
 * Server will recalculate on order submission for consistency.
 */
function calculatePizzaPrice(pizzaDetails, pricingRules) {
  const { size, crust, wholeToppings = [], leftHalfToppings = [], rightHalfToppings = [], modifiers = [] } = pizzaDetails;
  
  // Base price
  let baseCents = pricingRules?.basePriceCentsBySize?.[size] || 1799;
  let crustSurcharge = pricingRules?.crustSurchargeCentsByCrust?.[crust] || 0;
  
  // Gluten-Free special handling
  if (crust === 'Gluten-Free') {
    baseCents = pricingRules?.glutenFreeBaseCents || 1600;
    crustSurcharge = 0;
  }
  
  // Topping price per item
  const toppingPrice = pricingRules?.toppingPriceCentsBySize?.[size] || 250;
  const portionMultipliers = pricingRules?.portionMultipliers || { regular: 1, light: 1, extra: 2, no: 0 };
  
  // Count toppings (with portion multipliers)
  const countToppings = (toppings) => {
    return toppings.reduce((sum, t) => {
      const portion = typeof t === 'object' ? t.portion : 'regular';
      const multiplier = portionMultipliers[portion] ?? 1;
      return sum + multiplier;
    }, 0);
  };
  
  // Half toppings count as full per the plan
  const wholeCount = countToppings(wholeToppings);
  const leftCount = countToppings(leftHalfToppings);
  const rightCount = countToppings(rightHalfToppings);
  
  let toppingsCents = (wholeCount + leftCount + rightCount) * toppingPrice;
  
  // Extra cheese modifier counts as a topping
  const hasExtraCheese = modifiers.includes('extra cheese');
  if (hasExtraCheese && pricingRules?.extraCheeseCountsAsTopping) {
    toppingsCents += toppingPrice;
  }
  
  const totalCents = baseCents + crustSurcharge + toppingsCents;
  
  return {
    baseCents,
    crustSurcharge,
    toppingsCents,
    totalCents,
    price: totalCents / 100,
  };
}

function PizzaCustomizerModal({ menuItem, onClose, onAddToCart }) {
  const [size, setSize] = useState('Medium');
  const [crust, setCrust] = useState('Thin');
  const [wholeToppings, setWholeToppings] = useState([]);
  const [leftHalfToppings, setLeftHalfToppings] = useState([]);
  const [rightHalfToppings, setRightHalfToppings] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('whole'); // 'whole', 'left', 'right'
  
  // Initialize with default pizza details if provided
  useEffect(() => {
    if (menuItem?.defaultPizzaDetails) {
      const defaults = menuItem.defaultPizzaDetails;
      if (defaults.size) setSize(defaults.size);
      if (defaults.crust) setCrust(defaults.crust);
      if (defaults.wholeToppings) setWholeToppings(defaults.wholeToppings.map(t => ({ name: t, portion: 'regular' })));
      if (defaults.leftHalfToppings) setLeftHalfToppings(defaults.leftHalfToppings.map(t => ({ name: t, portion: 'regular' })));
      if (defaults.rightHalfToppings) setRightHalfToppings(defaults.rightHalfToppings.map(t => ({ name: t, portion: 'regular' })));
      if (defaults.modifiers) setModifiers(defaults.modifiers);
    }
  }, [menuItem]);
  
  const allowedSizes = menuItem?.allowedSizes || ['Personal', 'Small', 'Medium', 'Large'];
  const allowedCrusts = menuItem?.allowedCrusts || ['Thin', 'Regular', 'Double', 'Stuffed', 'Gluten-Free'];
  const allowedToppings = menuItem?.allowedToppings || [];
  const allowedModifiers = menuItem?.allowedModifiers || ['well-done', 'light sauce', 'extra sauce', 'no sauce', 'extra cheese'];
  const pricingRules = useMemo(() => menuItem?.pricingRules || {}, [menuItem?.pricingRules]);
  const maxToppings = menuItem?.constraints?.maxToppings || 10;
  
  // Calculate live price
  const pizzaDetails = useMemo(() => ({
    size,
    crust,
    wholeToppings,
    leftHalfToppings,
    rightHalfToppings,
    modifiers,
  }), [size, crust, wholeToppings, leftHalfToppings, rightHalfToppings, modifiers]);
  
  const pricing = useMemo(() => calculatePizzaPrice(pizzaDetails, pricingRules), [pizzaDetails, pricingRules]);
  
  // Get all selected toppings across all sections
  const totalToppingCount = wholeToppings.length + leftHalfToppings.length + rightHalfToppings.length;
  const canAddMoreToppings = totalToppingCount < maxToppings;
  
  // Toggle topping in a specific section
  const toggleTopping = (toppingName, section) => {
    const getToppings = () => {
      if (section === 'whole') return wholeToppings;
      if (section === 'left') return leftHalfToppings;
      return rightHalfToppings;
    };
    
    const setToppings = (newToppings) => {
      if (section === 'whole') setWholeToppings(newToppings);
      else if (section === 'left') setLeftHalfToppings(newToppings);
      else setRightHalfToppings(newToppings);
    };
    
    const current = getToppings();
    const exists = current.find(t => t.name === toppingName);
    
    if (exists) {
      // Remove topping
      setToppings(current.filter(t => t.name !== toppingName));
    } else if (canAddMoreToppings) {
      // Add topping
      setToppings([...current, { name: toppingName, portion: 'regular' }]);
    }
  };
  
  // Cycle portion for a topping
  const cyclePortion = (toppingName, section) => {
    const portions = ['regular', 'light', 'extra'];
    
    const getToppings = () => {
      if (section === 'whole') return wholeToppings;
      if (section === 'left') return leftHalfToppings;
      return rightHalfToppings;
    };
    
    const setToppings = (newToppings) => {
      if (section === 'whole') setWholeToppings(newToppings);
      else if (section === 'left') setLeftHalfToppings(newToppings);
      else setRightHalfToppings(newToppings);
    };
    
    const current = getToppings();
    setToppings(current.map(t => {
      if (t.name === toppingName) {
        const currentIndex = portions.indexOf(t.portion);
        const nextIndex = (currentIndex + 1) % portions.length;
        return { ...t, portion: portions[nextIndex] };
      }
      return t;
    }));
  };
  
  // Toggle modifier
  const toggleModifier = (mod) => {
    if (modifiers.includes(mod)) {
      setModifiers(modifiers.filter(m => m !== mod));
    } else {
      setModifiers([...modifiers, mod]);
    }
  };
  
  // Check if a topping is selected in any section
  const isToppingInSection = (toppingName, section) => {
    const toppings = section === 'whole' ? wholeToppings : section === 'left' ? leftHalfToppings : rightHalfToppings;
    return toppings.some(t => t.name === toppingName);
  };
  
  // Get portion label
  const getPortionLabel = (toppingName, section) => {
    const toppings = section === 'whole' ? wholeToppings : section === 'left' ? leftHalfToppings : rightHalfToppings;
    const t = toppings.find(t => t.name === toppingName);
    if (!t) return '';
    if (t.portion === 'extra') return ' (2x)';
    if (t.portion === 'light') return ' (light)';
    return '';
  };
  
  // Format price display
  const formatPrice = (cents) => `$${(cents / 100).toFixed(2)}`;
  
  // Build summary string
  const buildSummary = () => {
    const parts = [`${size} ${crust}`];
    
    const allToppings = [
      ...wholeToppings.map(t => `${t.name}${t.portion !== 'regular' ? ` (${t.portion})` : ''}`),
      ...leftHalfToppings.map(t => `Left: ${t.name}${t.portion !== 'regular' ? ` (${t.portion})` : ''}`),
      ...rightHalfToppings.map(t => `Right: ${t.name}${t.portion !== 'regular' ? ` (${t.portion})` : ''}`),
    ];
    
    if (allToppings.length > 0) {
      parts.push(allToppings.join(', '));
    }
    
    if (modifiers.length > 0) {
      parts.push(modifiers.join(', '));
    }
    
    return parts.join(' · ');
  };
  
  // Handle add to cart
  const handleAddToCart = () => {
    const cartItem = {
      itemId: menuItem.itemId,
      name: menuItem.name,
      price: pricing.price,
      quantity,
      isPizza: true,
      pizzaDetails: {
        size,
        crust,
        wholeToppings,
        leftHalfToppings,
        rightHalfToppings,
        modifiers,
      },
      pizzaSummary: buildSummary(),
    };
    
    onAddToCart(cartItem);
    onClose();
  };
  
  return (
    <div className="pizza-modal-overlay" onClick={onClose}>
      <div className="pizza-modal" onClick={e => e.stopPropagation()}>
        <div className="pizza-modal-header">
          <h2>{menuItem?.name || 'Build Your Pizza'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="pizza-modal-body">
          {/* Size Selection */}
          <div className="pizza-section">
            <h3>Size</h3>
            <div className="option-buttons">
              {allowedSizes.map(s => (
                <button
                  key={s}
                  className={`option-btn ${size === s ? 'selected' : ''}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                  <span className="option-price">
                    {formatPrice(pricingRules?.basePriceCentsBySize?.[s] || 1799)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Crust Selection */}
          <div className="pizza-section">
            <h3>Crust</h3>
            <div className="option-buttons">
              {allowedCrusts.map(c => {
                const surcharge = pricingRules?.crustSurchargeCentsByCrust?.[c] || 0;
                const isGlutenFree = c === 'Gluten-Free';
                const gfAllowed = pricingRules?.glutenFreeAllowedSizes || ['Small'];
                const gfDisabled = isGlutenFree && !gfAllowed.includes(size);
                
                return (
                  <button
                    key={c}
                    className={`option-btn ${crust === c ? 'selected' : ''} ${gfDisabled ? 'disabled' : ''}`}
                    onClick={() => !gfDisabled && setCrust(c)}
                    disabled={gfDisabled}
                    title={gfDisabled ? `Gluten-Free only available in ${gfAllowed.join(', ')}` : ''}
                  >
                    {c}
                    {surcharge > 0 && <span className="option-price">+{formatPrice(surcharge)}</span>}
                    {isGlutenFree && <span className="option-price">{formatPrice(pricingRules?.glutenFreeBaseCents || 1600)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Toppings Section */}
          <div className="pizza-section toppings-section">
            <h3>
              Toppings ({totalToppingCount}/{maxToppings})
              <span className="topping-price-hint">
                +{formatPrice(pricingRules?.toppingPriceCentsBySize?.[size] || 250)} each
              </span>
            </h3>
            
            {/* Half/Half Tabs */}
            <div className="half-tabs">
              <button
                className={`half-tab ${activeTab === 'whole' ? 'active' : ''}`}
                onClick={() => setActiveTab('whole')}
              >
                🍕 Whole ({wholeToppings.length})
              </button>
              <button
                className={`half-tab ${activeTab === 'left' ? 'active' : ''}`}
                onClick={() => setActiveTab('left')}
              >
                ◐ Left ({leftHalfToppings.length})
              </button>
              <button
                className={`half-tab ${activeTab === 'right' ? 'active' : ''}`}
                onClick={() => setActiveTab('right')}
              >
                ◑ Right ({rightHalfToppings.length})
              </button>
            </div>
            
            <div className="toppings-grid">
              {allowedToppings.map(topping => {
                const isSelected = isToppingInSection(topping, activeTab);
                const portionLabel = getPortionLabel(topping, activeTab);
                
                return (
                  <button
                    key={topping}
                    className={`topping-btn ${isSelected ? 'selected' : ''} ${!canAddMoreToppings && !isSelected ? 'disabled' : ''}`}
                    onClick={() => toggleTopping(topping, activeTab)}
                    onDoubleClick={() => isSelected && cyclePortion(topping, activeTab)}
                    disabled={!canAddMoreToppings && !isSelected}
                    title={isSelected ? 'Double-click to change portion' : ''}
                  >
                    {topping}{portionLabel}
                  </button>
                );
              })}
            </div>
            
            <p className="topping-hint">
              💡 Double-click a selected topping to cycle: Regular → Light → Extra
            </p>
          </div>
          
          {/* Modifiers */}
          <div className="pizza-section">
            <h3>Modifiers</h3>
            <div className="modifier-buttons">
              {allowedModifiers.map(mod => (
                <button
                  key={mod}
                  className={`modifier-btn ${modifiers.includes(mod) ? 'selected' : ''}`}
                  onClick={() => toggleModifier(mod)}
                >
                  {mod}
                  {mod === 'extra cheese' && pricingRules?.extraCheeseCountsAsTopping && (
                    <span className="option-price">+{formatPrice(pricingRules?.toppingPriceCentsBySize?.[size] || 250)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* Quantity */}
          <div className="pizza-section quantity-section">
            <h3>Quantity</h3>
            <div className="quantity-controls">
              <button
                className="qty-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                -
              </button>
              <span className="qty-value">{quantity}</span>
              <button
                className="qty-btn"
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
        
        {/* Price Summary & Add Button */}
        <div className="pizza-modal-footer">
          <div className="price-breakdown">
            <div className="breakdown-row">
              <span>Base ({size}):</span>
              <span>{formatPrice(pricing.baseCents)}</span>
            </div>
            {pricing.crustSurcharge > 0 && (
              <div className="breakdown-row">
                <span>Crust ({crust}):</span>
                <span>+{formatPrice(pricing.crustSurcharge)}</span>
              </div>
            )}
            {pricing.toppingsCents > 0 && (
              <div className="breakdown-row">
                <span>Toppings:</span>
                <span>+{formatPrice(pricing.toppingsCents)}</span>
              </div>
            )}
            <div className="breakdown-row total">
              <span>Total ({quantity}x):</span>
              <span>${(pricing.price * quantity).toFixed(2)}</span>
            </div>
          </div>
          
          <button className="add-to-cart-btn" onClick={handleAddToCart}>
            Add to Cart - ${(pricing.price * quantity).toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PizzaCustomizerModal;

