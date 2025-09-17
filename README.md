# PRIMESTAKE Admin Panel

Production-grade admin panel for PRIMESTAKE sportsbook with comprehensive betting management, risk control, and administrative features.

## 🚀 Features

- **Secure Admin Authentication** - Role-based access control with mandatory 2FA
- **Real-time Risk Management** - Live exposure calculation and automated alerts
- **Comprehensive Bet Management** - Full lifecycle bet control and settlement
- **Financial Reporting** - Complete P&L, GGR, and audit trail reporting
- **Match & Market Management** - Create and manage betting markets
- **User Administration** - Complete user lifecycle management
- **Audit Logging** - Immutable audit trail for all admin actions
- **Production Security** - HTTPS, CSRF protection, rate limiting, IP whitelisting

## 📋 Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 16+
- Redis 7+ (for sessions and caching)
- Git

## 🛠️ Installation & Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/primestake-admin-panel.git
cd primestake-admin-panel
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create `.env` file with required secrets:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/primestake
PGHOST=localhost
PGPORT=5432
PGUSER=primestake
PGPASSWORD=your-secure-password
PGDATABASE=primestake

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Application Secrets
JWT_SECRET=your-super-secure-jwt-secret-min-32-chars
ADMIN_JWT_SECRET=your-admin-jwt-secret-min-32-chars
SESSION_SECRET=your-session-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key-32-chars

# Admin Panel Configuration
ADMIN_BASE_PATH=/prime-admin
ADMIN_2FA_ENFORCED=true

# External API Keys
SPORTMONKS_API_KEY=your-sportmonks-api-key
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key

# Security & Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Feature Flags
DEMO_MODE=false
MAINTENANCE_MODE=false

# Monitoring (Optional)
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info
```

### 4. Database Setup

```bash
# Push schema to database
npm run db:push

# Or force push if there are conflicts
npm run db:push --force
```

### 5. Create Initial Admin User

```bash
npm run admin:create
```

Follow the prompts to create your first superadmin account with 2FA.

### 6. Start Development Server

```bash
npm run dev
```

The admin panel will be available at: `http://localhost:3000/prime-admin`

## 🏗️ Project Structure

```
primestake-admin-panel/
├── client/                     # Frontend React application
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/            # Page components
│   │   │   └── admin/        # Admin panel pages
│   │   ├── contexts/         # React contexts
│   │   ├── hooks/           # Custom React hooks
│   │   └── lib/             # Utilities
├── server/                    # Backend Express application
│   ├── index.ts             # Main server entry point
│   ├── routes.ts            # API routes
│   ├── storage.ts           # Data layer
│   ├── exposure-engine.ts   # Risk calculation engine
│   ├── security-middleware.ts
│   ├── rbac-middleware.ts
│   └── settlement-worker.ts
├── shared/                   # Shared types and schemas
│   ├── schema.ts           # Database schema (Drizzle)
│   └── types.ts            # TypeScript types
├── tests/                   # Test suites
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── load/              # Load testing
├── k8s/                    # Kubernetes manifests
├── scripts/               # Utility scripts
└── docs/                  # Documentation
```

## 🔐 Admin Panel Access

### Default Demo Login (Development Only)

**⚠️ Only available when `DEMO_MODE=true` in development**

- Username: `admin`
- Password: `admin123456`
- 2FA: Will be setup on first login

### Admin Roles

- **superadmin** - Full system access
- **admin** - General admin operations
- **risk_manager** - Risk and exposure management
- **finance** - Financial reporting and transactions
- **compliance** - Audit logs and user management
- **support** - Limited support operations

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Load testing
npm run test:load

# Test with coverage
npm run test:coverage
```

### Load Testing

Simulate heavy betting load:

```bash
npm run test:load
```

This runs comprehensive load tests including:
- Concurrent bet placement (50 users, 10 bets each)
- Exposure calculation performance
- Popular match simulation (200 concurrent bets)

## 🚀 Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f primestake-app
```

### Using Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n primestake

# Access logs
kubectl logs -f deployment/primestake-deployment -n primestake
```

### Environment-Specific Deployments

```bash
# Staging deployment
kubectl apply -f k8s/ -l env=staging

# Production deployment
kubectl apply -f k8s/ -l env=production
```

## 🔧 Critical Admin Operations

### Create Admin User

```bash
npm run admin:create
```

Prompts for:
- Username (unique)
- Email (unique)
- Secure password
- Role assignment
- 2FA setup

### Force Settle Bet

```bash
# Via admin panel UI
1. Navigate to /prime-admin/bets
2. Find bet by ID or filter
3. Click "Force Settle"
4. Provide reason and confirm with 2FA
5. Select outcome (won/lost/void)
6. Confirm settlement
```

### Database Backup & Restore

```bash
# Create backup
npm run backup:db

# Restore from backup
npm run restore:db -- backup-20240101-120000.sql
```

### Emergency Operations

#### Pause All Betting (Panic Button)

```bash
# Via admin panel
1. Navigate to /prime-admin/settings
2. Click "Emergency Controls"
3. Enable "Pause All Betting"
4. Confirm with 2FA and reason
```

#### Reset Admin 2FA

```bash
# For locked out admin users
npm run admin:reset-2fa -- admin-username
```

#### View Active Sessions

```bash
# Via admin panel
1. Navigate to /prime-admin/security
2. View "Active Sessions"
3. Can revoke individual or all sessions
```

## 📊 Monitoring & Logging

### Application Logs

```bash
# View live logs (development)
npm run dev

# Export logs for analysis
npm run logs:export -- --from=2024-01-01 --to=2024-01-31
```

### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Admin panel health
curl http://localhost:3000/prime-admin/health

# Database connectivity
npm run health:check
```

### Key Metrics to Monitor

- **Exposure Thresholds** - Set alerts for high liability
- **Failed Login Attempts** - Monitor for brute force attacks
- **Bet Settlement Delays** - Track settlement processing time
- **API Response Times** - Monitor admin panel performance
- **Database Connection Pool** - Monitor connection usage

## 🔒 Security Best Practices

### Production Security Checklist

- [ ] All default passwords changed
- [ ] 2FA enforced for all admin users
- [ ] IP whitelist configured for superadmin
- [ ] HTTPS/TLS enabled with valid certificates
- [ ] Rate limiting configured
- [ ] CSRF protection enabled
- [ ] Audit logging configured
- [ ] Backup strategy implemented
- [ ] Monitoring alerts configured

### Secret Management

**Never commit secrets to version control!**

```bash
# Production secret management
1. Use environment variables only
2. Rotate secrets quarterly
3. Use different secrets per environment
4. Encrypt sensitive database fields
5. Use external secret management (AWS Secrets Manager, HashiCorp Vault)
```

### API Key Management

```bash
# SportMonks API
SPORTMONKS_API_KEY=your-production-key

# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_live_your-production-key

# Never use test keys in production!
```

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Fails

```bash
# Check database status
npm run health:check

# Verify DATABASE_URL format
postgresql://username:password@host:port/database

# Check PostgreSQL service
systemctl status postgresql
```

#### Admin Panel Not Accessible

```bash
# Check ADMIN_BASE_PATH setting
echo $ADMIN_BASE_PATH  # Should be /prime-admin

# Check if maintenance mode is enabled
echo $MAINTENANCE_MODE  # Should be false

# Verify admin user exists
npm run admin:list
```

#### 2FA Issues

```bash
# Reset 2FA for locked admin
npm run admin:reset-2fa -- username

# Check TOTP time sync
# Ensure server time is accurate (NTP)
```

#### High Memory Usage

```bash
# Check exposure calculation frequency
# Default: updates every 1 minute
# Increase interval for high-load systems

# Monitor memory usage
docker stats primestake-app
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable all debug output
DEBUG=* npm run dev
```

### Performance Optimization

```bash
# Database indexes
# Check slow query log
# Monitor exposure calculation performance
# Optimize Redis caching strategy
# Scale horizontally with load balancer
```

## 📚 API Documentation

### Admin API Endpoints

```bash
# Authentication
POST /api/admin/login          # Admin login with 2FA
POST /api/admin/logout         # Admin logout
GET  /api/admin/profile        # Current admin profile

# Dashboard
GET  /api/admin/dashboard      # Admin dashboard stats

# Matches & Markets
GET    /api/admin/matches      # List matches
POST   /api/admin/matches      # Create match
PUT    /api/admin/matches/:id  # Update match
DELETE /api/admin/matches/:id  # Soft delete match

# Risk & Exposure
GET  /api/admin/exposure       # Get exposure data
GET  /api/admin/exposure/matches/:id  # Match exposure

# Bet Management
GET  /api/admin/bets           # List bets with filters
POST /api/admin/bets/:id/settle # Force settle bet

# User Management
GET    /api/admin/users        # List users
POST   /api/admin/users/:id/block    # Block user
POST   /api/admin/users/:id/unblock  # Unblock user

# Financial Reports
GET  /api/admin/reports/ggr    # Gross Gaming Revenue
GET  /api/admin/reports/financials # Financial summary

# Audit Logs
GET  /api/admin/audit          # Audit trail
```

All admin endpoints require:
- Valid admin session
- Appropriate role permissions
- 2FA verification for destructive actions

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# Automatic pipeline on push/PR
- Code quality checks (ESLint, Prettier, TypeScript)
- Security audit (npm audit, Snyk)
- Unit and integration tests
- Load testing (main branch only)
- Docker image build and push
- Automated deployment to staging/production
- Slack notifications
```

### Manual Deployment

```bash
# Build Docker image
docker build -t primestake/admin-panel:latest .

# Push to registry
docker push primestake/admin-panel:latest

# Deploy to Kubernetes
kubectl set image deployment/primestake-deployment primestake=primestake/admin-panel:latest -n primestake
```

## 📞 Support & Maintenance

### Regular Maintenance Tasks

- [ ] **Weekly** - Review audit logs and security alerts
- [ ] **Weekly** - Check database performance and optimize queries
- [ ] **Monthly** - Rotate API keys and secrets
- [ ] **Monthly** - Review and update dependencies
- [ ] **Quarterly** - Full security audit and penetration testing
- [ ] **Quarterly** - Disaster recovery testing

### Getting Help

1. **Check logs first**: Use `npm run logs:export` for detailed logs
2. **Security issues**: Never share secrets or sensitive data
3. **Database issues**: Always backup before making changes
4. **Performance issues**: Use load testing to identify bottlenecks

### Production Support Contacts

- **Emergency**: emergency@primestake.com
- **Technical Support**: tech-support@primestake.com
- **Security Issues**: security@primestake.com

---

## 📄 License

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

**© 2024 PRIMESTAKE. All rights reserved.**