# Stripe-Enhance Integration Backend

Acest sistem automatizează integrarea între Stripe (plăți) și Enhance (hosting), creând și gestionând automat conturile de hosting pe baza abonamentelor plătite.

## Funcționalități

- **Automatizare completă**: Când cineva plătește un abonament în Stripe, se creează automat un cont în Enhance
- **Sincronizare status**: Anulări, suspendări și reactivări sunt sincronizate între sisteme
- **Gestionare planuri**: Mapare flexibilă între planurile Stripe și planurile Enhance
- **Monitorizare**: Endpoint-uri pentru monitorizare și administrare
- **Logging complet**: Toate operațiunile sunt loggate pentru debugging și audit

## Arhitectura

- **Vercel Functions**: Procesarea webhook-urilor Stripe
- **Neon PostgreSQL**: Baza de date pentru sincronizare și audit
- **Stripe API**: Gestionarea plăților și abonamentelor
- **Enhance API**: Crearea și gestionarea conturilor de hosting

## Setup

### 1. Environment Variables

Configurează următoarele variabile în Vercel:

\`\`\`bash
# Database
DATABASE_URL=postgresql://...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Enhance
ENHANCE_API_URL=https://api.enhance.com
ENHANCE_API_TOKEN=your_enhance_token
ENHANCE_ORG_ID=your_org_id

# Admin
ADMIN_API_KEY=your_secure_admin_key

# Optional
LOG_LEVEL=INFO
APP_VERSION=1.0.0
\`\`\`

### 2. Database Setup

Rulează scripturile SQL din folderul `scripts/` pentru a crea schema:

\`\`\`bash
# În Vercel, scripturile se rulează automat
# sau poți rula manual în Neon dashboard
\`\`\`

### 3. Stripe Webhook Configuration

Configurează webhook-ul în Stripe Dashboard:
- URL: `https://your-domain.vercel.app/api/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 4. Plan Mappings

Adaugă mapările între planurile Stripe și Enhance în tabela `plan_mappings`:

\`\`\`sql
INSERT INTO plan_mappings (billing_provider, billing_plan_id, enhance_plan_id) VALUES
('stripe', 'price_basic_monthly', 'basic-hosting-plan'),
('stripe', 'price_pro_monthly', 'pro-hosting-plan');
\`\`\`

## API Endpoints

### Webhook Handler
- `POST /api/webhook` - Procesează webhook-urile Stripe

### Admin Endpoints (necesită `Authorization: Bearer ADMIN_API_KEY`)
- `GET /api/health` - Status sistem și servicii
- `GET /api/admin/dashboard` - Dashboard cu metrici
- `POST /api/admin/sync` - Sincronizare manuală
- `GET /api/admin/customers?email=...` - Căutare clienți

## Monitorizare

### Health Check
\`\`\`bash
curl https://your-domain.vercel.app/api/health
\`\`\`

### Dashboard
\`\`\`bash
curl -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  https://your-domain.vercel.app/api/admin/dashboard
\`\`\`

## Fluxuri de Business

### 1. Abonament Nou
1. Client plătește în Stripe
2. Stripe trimite `checkout.session.completed`
3. Sistem creează client în Enhance
4. Sistem creează abonament în Enhance
5. Toate datele sunt salvate în baza de date

### 2. Anulare Abonament
1. Abonament anulat în Stripe
2. Stripe trimite `customer.subscription.deleted`
3. Sistem suspendă abonamentul în Enhance
4. Status actualizat în baza de date

### 3. Neplată / Reactivare
1. Stripe actualizează status abonament
2. Stripe trimite `customer.subscription.updated`
3. Sistem suspendă/reactivează în Enhance pe baza statusului

## Debugging

### Logs
Toate operațiunile sunt loggate cu detalii complete. Verifică logs în Vercel Dashboard.

### Failed Webhooks
\`\`\`bash
curl -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  https://your-domain.vercel.app/api/admin/dashboard
\`\`\`

### Manual Sync
\`\`\`bash
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId": "sub_..."}' \
  https://your-domain.vercel.app/api/admin/sync
\`\`\`

## Securitate

- Verificarea semnăturii pentru toate webhook-urile Stripe
- Autentificare pentru endpoint-urile admin
- Retry logic cu exponential backoff
- Idempotency pentru toate operațiunile
- Logging complet pentru audit

## Dezvoltare

### Structura Proiectului
\`\`\`
├── api/
│   ├── webhook.ts          # Handler principal webhook
│   ├── health.ts           # Health check
│   └── admin/              # Endpoint-uri admin
├── lib/
│   ├── database.ts         # Operațiuni baza de date
│   ├── stripe.ts           # Integrare Stripe
│   ├── enhance.ts          # Integrare Enhance
│   ├── subscription-manager.ts # Logica de business
│   ├── logger.ts           # Logging structurat
│   └── error-handler.ts    # Gestionarea erorilor
└── scripts/
    └── *.sql               # Schema și migrări
\`\`\`

### Testing
Pentru testare, folosește Stripe CLI pentru a simula webhook-uri:

\`\`\`bash
stripe listen --forward-to localhost:3000/api/webhook
stripe trigger checkout.session.completed
