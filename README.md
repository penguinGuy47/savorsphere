# Savor Sphere

**AI-powered phone ordering system for pizza restaurants**

Savor Sphere replaces phone staff with an AI agent that takes orders 24/7, handles delivery address verification, and integrates seamlessly with restaurant operations.

---

## 🎯 Project Overview

Savor Sphere is a vertical SaaS solution that helps pizza restaurants:
- **Eliminate phone staff costs** ($1,500–$4,000/month savings)
- **Never miss a call** (24/7 coverage, instant scaling during rush)
- **Reduce order errors** (consistent AI, no training needed)
- **Improve customer experience** (fast, friendly, always available)

### Business Model
- **Pricing**: $499–$699/month per store (tiered by call volume)
- **Free trial**: First month free (phased rollout: transcripts → hybrid → full AI)
- **Target**: Pizza restaurants handling 50–150 phone orders/day

---

## 📊 Current Status

### ✅ What's Built & Working

#### Backend (AWS CDK)
- **Lambda functions**:
  - `lookupAddress` - Address verification with phonetic matching (handles "Lane" vs "LN", etc.)
  - `vapiOrderWebhook` - Receives `submit_order` tool calls from Vapi AI agent, creates orders in DynamoDB
  - `createOrder` / `updateOrder` - Order management
  - `getMenu` / `createMenuItem` / `updateMenuItem` / `deleteMenuItem` - Menu CRUD
  - `getSettings` / `updateSettings` - Restaurant configuration
  - Multi-tenant support via `restaurantId` isolation

- **DynamoDB tables**:
  - `Orders` - Order records
  - `OrderItems` - Line items per order
  - `MenuItems` - Menu catalog
  - `RestaurantSettings` - Business hours, delivery zones, tax rates
  - `StreetsByZip` - Street data for address lookup (seeded from OpenStreetMap)

- **API Gateway**: RESTful endpoints for all operations

#### AI Integration (Vapi)
- **Phone agent** configured with:
  - System prompt optimized for pizza ordering
  - `lookup_address` tool → `/address/lookup` → `lookupAddress` Lambda
  - `submit_order` tool → `/vapi/webhook` → `vapiOrderWebhook` Lambda
  - Handles pickup vs delivery flows
  - Address disambiguation (e.g., "Grouse Lane" vs "Grouse CT")

#### Admin Dashboard (React)
- **Dashboard** (`/:restaurantId`):
  - Today's Orders (real-time tracking)
  - Hours & Settings (business hours, delivery fees, tax)
  - Loyalty & Promos
  - Call Logs & Recordings
  - Reports (revenue, top items, conversion rate)
  - Billing & Account

- **Kitchen View** (`/:restaurantId/kitchen`):
  - Fullscreen order display
  - Order status management (New → Accepted → Ready → Completed)
  - Sound notifications

- **Menu View** (`/:restaurantId/menu`):
  - Public-facing menu display

#### Customer App (Next.js)
- Menu browsing
- Cart & checkout
- Order confirmation

### 🚧 In Progress / Next Steps

1. **Verify delivery flow end-to-end** ⚠️
   - Test `lookup_address` in live Vapi calls
   - Confirm orders appear in kitchen display
   - Fix any edge cases

2. **Kitchen display enhancements**
   - Order sound notifications
   - Status update workflow polish
   - Print ticket option (for kitchens that prefer paper)

3. **Menu management**
   - Dashboard UI for adding/editing items
   - Toppings & customizations in voice flow
   - Specials & promotions

4. **Pilot store preparation**
   - Seed street data for pilot store's ZIP codes
   - Load pilot store's menu
   - Test with real phone calls

### 🔮 Future Roadmap

#### Phase 2 (Post-Pilot)
- Payment integration (Square/Stripe Terminal)
- SMS order confirmations
- Order history & reporting
- Multi-store support

#### Phase 3 (Scale)
- POS integration (unified display)
- Walk-in order entry on tablet
- Advanced analytics
- Referral program

#### Phase 4 (Mature)
- Full POS replacement
- Multi-language support
- Expansion to other cuisines (Chinese, Indian, etc.)

---

## 🏗️ Architecture

```
┌─────────────┐
│   Vapi AI   │  ← Phone calls → AI agent
│   Agent     │
└──────┬──────┘
       │ HTTP POST (tool calls)
       ▼
┌─────────────────┐
│  API Gateway     │
│  (AWS)           │
└──────┬───────────┘
       │
       ├─► /address/lookup → lookupAddress Lambda → StreetsByZip (DynamoDB)
       │
       └─► /vapi/webhook → vapiOrderWebhook Lambda → Orders/OrderItems (DynamoDB)
                    │                                    (submit_order tool)
                    ▼
            ┌───────────────┐
            │ Admin Dashboard│  ← Kitchen staff views orders
            │ (React)        │
            └───────────────┘
```

### Key Technologies
- **Backend**: AWS Lambda, DynamoDB, API Gateway, CDK
- **AI**: Vapi (voice AI platform)
- **Frontend**: React (admin), Next.js (customer app)
- **Address Lookup**: OpenStreetMap Overpass API → phonetic matching (Double Metaphone + Levenshtein)

---

## 💰 Economics

### Cost Structure (per store, ~100 calls/day)
- **Vapi**: ~$540/month (2 min avg × $0.09/min × 3,000 calls)
- **AWS**: ~$5/month (Lambda, DynamoDB, API Gateway)
- **Total COGS**: ~$545/month

### Revenue Model
- **Starter**: Up to 500 calls/mo (~17/day) → $199/mo
- **Growth**: Up to 1,500 calls/mo (~50/day) → $399/mo
- **Pro**: Up to 3,000 calls/mo (~100/day) → $599/mo
- **Enterprise**: Unlimited → $799+/mo

### Unit Economics (Pro tier)
- Revenue: $599/month
- COGS: $545/month
- **Margin**: ~$54/month (9%)

*Note: Margin improves with volume discounts from Vapi and call duration optimization*

---

## 🚀 Getting Started

### Prerequisites
- AWS account with CDK configured
- Vapi account
- Node.js 18+

### Backend Setup
```bash
cd backend
npm install
npx cdk deploy SavorSphereProd
```

### Admin Dashboard
```bash
cd admin-dashboard
npm install
npm start
```

### Seed Street Data
```bash
cd backend
node scripts/fetch-streets-osm.mjs --restaurant rest-001 --zip 60008
```

---

## 📝 Notes

- **Last Updated**: January 2025
- **Team Size**: 1 person (solo dev)
- **Current Phase**: Pre-pilot (verifying core functionality)

### Monthly Updates
This README is updated monthly to track progress, goals, and learnings.

---

## 📚 Documentation

- [Vapi Address Lookup Setup](./backend/docs/VAPI_ADDRESS_LOOKUP_SETUP.md)
- [Vapi System Prompt](./backend/docs/vapi-system-prompt.md)
- [Admin Dashboard README](./admin-dashboard/README.md)

---

## 🎯 Success Metrics

### MVP Goals
- [ ] Complete delivery order flow works end-to-end
- [ ] Kitchen display shows orders in real-time
- [ ] First pilot store signed up
- [ ] <5% order error rate

### Pilot Goals (Month 1)
- [ ] 1–3 stores live
- [ ] 70%+ call completion rate
- [ ] Store owners report labor savings
- [ ] Case study ready

### Growth Goals (Months 2–6)
- [ ] 10+ stores
- [ ] Positive unit economics
- [ ] Referral pipeline established
- [ ] Payment integration live

---

*Built with ❤️ for pizza restaurants everywhere*

