# Savor Sphere Admin Dashboard

A comprehensive admin dashboard for restaurant owners to manage orders, menu, settings, and analytics.

## Features

### 6 Main Tabs

1. **Orders** (Default)
   - Real-time order tracking
   - Revenue display
   - Filter by type (All/Pickup/Delivery/Last Hour)
   - Status management (New → Accepted → Ready → Completed)
   - Click-to-call/text customer phone numbers
   - CSV export for tax purposes
   - Pull-to-refresh on mobile

2. **Hours & Settings**
   - Business hours for each day
   - Delivery settings (minimum order, fee)
   - Tax rate configuration
   - Credit card fee toggle
   - Voice greeting editor

3. **Loyalty & Promos**
   - Current promo banner
   - One-click promo templates
   - SMS blast functionality
   - Loyalty program stats

4. **Call Logs & Recordings**
   - Searchable call history
   - Play recordings
   - Conversion rate tracking

5. **Reports**
   - Revenue charts (last 30 days)
   - Top selling items
   - Conversion rate
   - Peak hours heatmap
   - Labor savings calculator

6. **Billing & Account**
   - Current plan details
   - Payment method management
   - Referral program
   - Direct support links

**Note:** Menu is managed via DynamoDB, so there is no Menu Editor tab in the dashboard.

## URL Structure

- `/:restaurantId` - Main dashboard
- `/:restaurantId/kitchen` - Kitchen display (fullscreen, no sidebar)
- `/:restaurantId/menu` - Public menu view

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm start
```

The app will open at `http://localhost:3000`

### Build

```bash
npm run build
```

## Mobile-First Design

- Touch-friendly buttons (minimum 44px height)
- Responsive layouts
- Pull-to-refresh on Today's Orders
- Optimized for iPhone/iPad use

## Dark Mode

- Toggle in top-right corner
- Persists across sessions
- Respects system preferences on first load

## Tech Stack

- React 19
- React Router DOM
- Recharts (for analytics)
- date-fns (for date formatting)
- CSS Variables (for theming)

## Next Steps

1. Connect to real backend API (AppSync/DynamoDB)
2. Implement real-time updates via WebSocket/GraphQL subscriptions
3. Add authentication
4. Integrate Stripe for billing
5. Add SMS service integration
6. Connect to phone recording storage

