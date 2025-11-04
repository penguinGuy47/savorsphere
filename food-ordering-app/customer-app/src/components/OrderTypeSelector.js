import React from 'react';

function OrderTypeSelector({ onChange, settings }) {
  const options = [];
  if (settings.pickupEnabled) options.push('Pickup');
  if (settings.dineInEnabled) options.push('Dine-In');
  if (settings.deliveryEnabled) options.push('Delivery');

  return (
    <select onChange={(e) => onChange(e.target.value.toLowerCase())} className="border p-2 rounded">
      {options.map((opt) => <option key={opt}>{opt}</option>)}
    </select>
  );
}

export default OrderTypeSelector;