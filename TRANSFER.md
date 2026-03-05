# KDT Aso — Transfer Guide

## Quick Setup on New Mac mini

### 1. Prerequisites
```bash
# Install Node.js 18+ (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Install git
xcode-select --install
```

### 2. Clone the repo
```bash
git clone https://github.com/hugirecon/kdt-aso.git
cd kdt-aso
```

### 3. Install dependencies
```bash
npm install
cd dashboard && npm install && npm run build && cd ..
```

### 4. Configure environment
```bash
cp .env.example .env
# Edit .env — REQUIRED:
#   - ANTHROPIC_API_KEY
#   - JWT_SECRET (generate a unique one!)
#   - PROPERTY_ID (for this specific property)
#   - AGENT_INSTANCE_ID (unique per Mac mini)

# Generate JWT secret:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Change default admin password
```bash
# Start the server first
npm start

# Then immediately change the admin password via the API or dashboard
# Default creds: admin / admin — CHANGE IMMEDIATELY
```

### 6. Configure for property
Edit `config/property.json`:
- Set `property.id` to this property's unique identifier
- Set `property.name` to the property name
- Set `agent.instanceId` to this Mac mini's unique ID
- Set `deployment.mode` to `"single-property"` or `"fleet"`

### 7. Set up as service (auto-start on boot)
```bash
# Using pm2 (recommended)
npm install -g pm2
pm2 start core/index.js --name kdt-aso
pm2 save
pm2 startup  # Follow the instructions it gives you
```

### 8. OpenClaw integration
When setting up OpenClaw on the same Mac mini:
- The OpenClaw agent will communicate with KDT Aso via localhost:3001
- Configure the agent's SOUL.md to reference this property's identity
- Set the agent to handle requests for this property's tenants

---

## Security Checklist (MANDATORY before going live)

- [ ] Changed default admin password
- [ ] Generated unique JWT_SECRET
- [ ] Set NODE_ENV=production in .env
- [ ] Configured CORS_ORIGINS for your domain (if not localhost-only)
- [ ] Reviewed and set IP_ALLOWLIST if needed
- [ ] Changed ANTHROPIC_API_KEY to property-specific key
- [ ] Set unique PROPERTY_ID and AGENT_INSTANCE_ID
- [ ] Tested all endpoints respond correctly
- [ ] Dashboard accessible and functional
- [ ] Socket.io connections authenticated
- [ ] Verified no default credentials remain

## File Structure
```
kdt-aso/
├── core/           # Backend application logic
│   ├── index.js    # Main entry point
│   ├── auth.js     # Authentication (JWT, bcrypt)
│   ├── security.js # Security middleware (NEW)
│   ├── router.js   # Agent routing
│   └── ...         # Other modules
├── config/         # Configuration files
│   ├── property.json   # Property/instance config (NEW)
│   ├── settings.json   # System settings
│   ├── users.json      # User accounts (hashed)
│   ├── system.yaml     # Agent configuration
│   └── keys/           # Encryption keys (auto-generated)
├── dashboard/      # React frontend
├── agents/         # Agent definitions (SOUL files)
├── documents/      # Document storage
├── memory/         # Agent memory files
├── backups/        # System backups
├── scripts/        # Build/deploy scripts
├── nginx/          # Nginx config (for production)
└── __tests__/      # Test suite
```
