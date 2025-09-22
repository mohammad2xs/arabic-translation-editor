# The Human - Deployment Guide

This guide covers the comprehensive deployment system with one-command deployment, automated CI/CD, environment validation, and health monitoring.

## 🚀 One-Command Deployment

The deployment system provides automated orchestration with built-in validation, health checking, and deployment verification.

### Quick Deploy Commands

```bash
# Deploy to preview environment
npm run deploy:preview

# Deploy to production with quality gates
npm run deploy:prod

# Full deployment workflow with prewarm
npm run workflow:full

# Dry-run deployment (validation only)
npm run deploy:dry-run
```

### Example Deployment Output

```bash
$ npm run deploy:prod

Deployed ✓  env:OK  provider:claude  storage:vercel-blob
preview:https://the-human-xyz.vercel.app  prod:https://thehuman.ai
health:https://thehuman.ai/api/health
prewarm: 3 endpoints warmed in 1.8s
Tip: set ELEVENLABS_API_KEY to enable full Audiobook Mode in prod
```

## 📋 Environment Variables

The deployment system uses comprehensive environment validation with Zod schemas. All variables are validated before deployment.

### Core Application Variables

```env
# Required for all deployments
SHARE_KEY=your-secure-256-bit-key-here
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### LLM Provider Configuration

```env
# Provider selection (claude|gemini|openai)
LLM_PROVIDER=claude

# Anthropic Claude (default)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=8000
ANTHROPIC_TIMEOUT=30000

# Google Vertex AI (if LLM_PROVIDER=gemini)
GOOGLE_VERTEX_KEY=your-vertex-key-here
GOOGLE_API_KEY=your-google-api-key-here

# OpenAI (if LLM_PROVIDER=openai)
OPENAI_API_KEY=sk-your-openai-key-here
```

### Storage Configuration

```env
# Storage driver selection (vercel-blob|s3|fs)
STORAGE_DRIVER=vercel-blob

# Vercel Blob Storage (recommended for Vercel deployments)
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_your-token-here

# AWS S3 Storage (if STORAGE_DRIVER=s3)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-s3-bucket-name
AWS_REGION=us-east-1
```

### Optional Services

```env
# ElevenLabs TTS Service (enables Audiobook Mode)
ELEVENLABS_API_KEY=your-elevenlabs-key-here

# Deployment Configuration
DEPLOY_AUTO_PREWARM=true
HEALTH_INCLUDE_QUALITY=false

# Assistant Configuration
MAX_DAILY_TOKENS=250000
MAX_RPM=10
RATE_LIMIT_RPM=60
MAX_TOKEN_LIFETIME=168
```

### Build Metadata (Auto-Generated)

```env
# Automatically provided by Vercel
VERCEL_GIT_COMMIT_SHA=auto-provided
VERCEL_GIT_COMMIT_MESSAGE=auto-provided
VERCEL_ENV=auto-provided
VERCEL_URL=auto-provided
```

## 🔧 Vercel Setup

### 1. Install and Link Project

```bash
# Install Vercel CLI
npm install -g vercel

# Link to existing Vercel project
vercel link

# Or create new project
vercel
```

### 2. Configure Environment Variables

```bash
# Set required environment variables
vercel env add SHARE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add VERCEL_BLOB_READ_WRITE_TOKEN

# Optional: Set LLM provider
vercel env add LLM_PROVIDER

# Optional: Enable TTS
vercel env add ELEVENLABS_API_KEY
```

### 3. Deploy with Validation

```bash
# Validate environment first
npm run env:check:prod

# Deploy with full validation and health checking
npm run deploy:prod
```

## 🏥 Health Monitoring

The deployment system includes comprehensive health monitoring with multiple endpoints and quality gates.

### Health Endpoints

```bash
# Basic health check
GET /api/health
Response: {"ok": true, "status": "ready", "provider": "claude", "storage": "vercel-kv", "build": {"sha": "abc12345", "time": "2025-01-23T10:30:00Z", "deploymentReady": true}}

# Detailed health information
GET /api/health?detailed=true
Response: {
  "ok": true,
  "status": "ready",
  "build": {"sha": "abc123...", "shortSha": "abc12345", "time": "2025-01-23T10:30:00Z"},
  "provider": "claude",
  "storageDriver": "vercel-kv",
  "assistant": {"ok": true, "model": "claude-3-5-sonnet-20241022", "key_present": true, "status": "healthy"},
  "storage": {"ping": true, "driver": "vercel-kv"},
  "environment": {"mode": "production", "missing": [], "warnings": []},
  "services": {"elevenlabs": true, "optional": true}
}

# Quality gates and deployment readiness
GET /api/health?quality=true
Response: {
  "ok": true,
  "status": "ready",
  "build": {"sha": "abc12345", "time": "2025-01-23T10:30:00Z", "deploymentReady": true},
  "quality": {
    "overallPass": true,
    "deploymentReady": true,
    "lpr": {"average": 0.95, "minimum": 0.89},
    "coverage": {"percentage": 0.89},
    "gates": {"passed": ["build", "lint", "types"], "failed": []}
  },
  "artifacts": {"status": "complete", "count": 4}
}
```

### Health Status Meanings

- **ready**: All systems operational, deployment ready
- **degraded**: Some non-critical issues, still functional
- **unhealthy**: Critical issues, deployment blocked

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The repository includes automated CI/CD with `.github/workflows/ci-deploy.yml`:

**Pull Requests:**
- Environment validation
- Lint and type checking
- Preview deployment
- Health verification
- PR comment with deployment details

**Main Branch/Tags:**
- Full quality gates validation
- Production deployment
- Comprehensive health checks
- Endpoint prewarming
- Deployment verification

### Repository Secrets

Configure these secrets in GitHub repository settings:

```env
# Vercel Integration
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID=your-project-id

# Application Secrets
SHARE_KEY=your-secure-key
ANTHROPIC_API_KEY=your-anthropic-key
VERCEL_BLOB_READ_WRITE_TOKEN=your-blob-token
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Optional Services
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### Workflow Triggers

- **Pull Request**: Deploy preview environment
- **Push to main**: Deploy production
- **Tag (v*)**: Release deployment
- **Manual**: Workflow dispatch with environment selection

## 🛠️ Environment Validation

### Validation Commands

```bash
# Check current environment
npm run env:check

# Validate production environment
npm run env:check:prod

# Validate Vercel-specific settings
npm run env:check:vercel

# Validate quality gates
npm run validate:quality

# Build validation
npm run build:validate
```

### Environment Validation Output

```bash
$ npm run env:check:prod

✅ Core variables validated
✅ LLM provider: claude (connected)
✅ Storage driver: vercel-blob (connected)
✅ Optional services: elevenlabs (connected)
✅ Quality gates: passed (LPR: 0.95, Coverage: 0.89)
✅ Deployment ready

Environment validation passed - ready for production deployment
```

## 🚨 Troubleshooting

### Common Deployment Issues

#### Environment Validation Failures

```bash
# Error: Missing required environment variable
❌ ANTHROPIC_API_KEY is required when LLM_PROVIDER=claude

# Solution: Set the required variable
vercel env add ANTHROPIC_API_KEY
```

#### Health Check Failures

```bash
# Check health endpoint directly
curl https://your-app.vercel.app/api/health?detailed=true

# Common issues:
# - LLM provider connection failure
# - Storage driver not accessible
# - Quality gates not met
```

#### Storage Connection Issues

```bash
# Verify storage driver configuration
npm run env:check:vercel

# Test storage connectivity
curl "https://your-app.vercel.app/api/health?detailed=true" | jq '.storage'
```

#### LLM Provider Issues

```bash
# Check provider configuration
npm run env:check:prod

# Test provider connectivity
curl "https://your-app.vercel.app/api/health?detailed=true" | jq '.llm'
```

### Quality Gates Failures

```bash
# Check quality metrics
npm run validate:quality

# Review quality gates
curl "https://your-app.vercel.app/api/health?quality=true" | jq '.quality'

# Common causes:
# - Low LPR scores
# - Insufficient coverage
# - Build validation failures
```

### Deployment Verification Failures

```bash
# Check deployment status
vercel ls

# Test core endpoints
curl -f https://your-app.vercel.app/
curl -f https://your-app.vercel.app/api/health

# Review deployment logs
vercel logs
```

### Debug Mode

Enable detailed logging:

```bash
# Set debug environment variable
vercel env add DEBUG true

# Review function logs
vercel logs --follow
```

## 🔒 Security Checklist

- [ ] **Strong secrets**: Generate secure `SHARE_KEY` with sufficient entropy
- [ ] **API keys**: Secure LLM provider and storage credentials
- [ ] **HTTPS**: Enabled automatically with Vercel
- [ ] **Environment isolation**: Separate keys for preview/production
- [ ] **Secret rotation**: Regularly update API keys and tokens
- [ ] **Access control**: Limit Vercel team access
- [ ] **Monitoring**: Enable deployment health monitoring
- [ ] **Quality gates**: Ensure quality validation before production

### Generate Secure Secrets

```bash
# Generate SHARE_KEY (256-bit)
openssl rand -base64 32

# Generate UUID for additional entropy
uuidgen
```

## 🎯 Advanced Configuration

### Custom Domain Setup

```bash
# Add domain in Vercel dashboard
vercel domains add your-domain.com

# Update environment variables
vercel env add NEXT_PUBLIC_APP_URL https://your-domain.com
```

### Multi-Environment Strategy

```bash
# Preview environment
vercel env add ENVIRONMENT preview
npm run deploy:preview

# Production environment
vercel env add ENVIRONMENT production
npm run deploy:prod
```

### Quality Gates Configuration

```bash
# Configure quality thresholds
vercel env add QUALITY_MIN_LPR 0.90
vercel env add QUALITY_MIN_COVERAGE 0.85
vercel env add QUALITY_ENFORCE_GATES true
```

### Auto-Prewarm Configuration

```bash
# Enable post-deployment prewarming
vercel env add DEPLOY_AUTO_PREWARM true

# Configure prewarm endpoints
npm run postdeploy:prewarm
```

## 📊 Monitoring and Observability

### Health Monitoring

Monitor deployment health continuously:

```bash
# Basic health monitoring
curl https://your-app.vercel.app/api/health

# Comprehensive health dashboard
curl https://your-app.vercel.app/api/health?detailed=true

# Quality gates monitoring
curl https://your-app.vercel.app/api/health?quality=true
```

### Deployment Metrics

Track key deployment metrics:

- **Deployment frequency**: How often deployments succeed
- **Health status**: Overall system health
- **Quality gates**: LPR scores and coverage
- **Performance**: Endpoint response times
- **Errors**: Deployment and runtime failures

### Logging

```bash
# View real-time logs
vercel logs --follow

# Filter by function
vercel logs --follow --function api/health

# Export logs for analysis
vercel logs --since 1d > deployment.log
```

## 🚀 Production Readiness

### Pre-Deployment Checklist

- [ ] **Environment validated**: `npm run env:check:prod` passes
- [ ] **Quality gates**: `npm run validate:quality` passes
- [ ] **Build validation**: `npm run build:validate` passes
- [ ] **Health endpoint**: Returns healthy status
- [ ] **Storage connectivity**: Verified working
- [ ] **LLM provider**: Connection tested
- [ ] **Security review**: Secrets and access controls verified

### Post-Deployment Verification

- [ ] **Health check**: `/api/health?detailed=true` returns healthy
- [ ] **Core functionality**: Main application features working
- [ ] **Storage operations**: File upload/download working
- [ ] **LLM integration**: AI features responding
- [ ] **Performance**: Response times acceptable
- [ ] **Quality gates**: Deployment readiness maintained

### Rollback Strategy

```bash
# Rollback to previous deployment
vercel rollback

# Specific deployment rollback
vercel rollback [deployment-url]

# Emergency rollback with health check
vercel rollback && curl /api/health
```

## 📞 Support and Maintenance

### Regular Maintenance Tasks

1. **Monitor health endpoints** - Daily health checks
2. **Review quality metrics** - Weekly quality gate reports
3. **Update dependencies** - Monthly security updates
4. **Rotate secrets** - Quarterly key rotation
5. **Review logs** - Weekly error analysis

### Getting Help

1. **Check health endpoint**: Start with `/api/health?detailed=true`
2. **Review deployment logs**: Use `vercel logs`
3. **Validate environment**: Run `npm run env:check:prod`
4. **Test components**: Check storage, LLM, and core features
5. **Review quality gates**: Ensure deployment readiness

### Emergency Procedures

1. **Service degradation**: Check health endpoint and logs
2. **Deployment failure**: Run validation commands and rollback if needed
3. **Security incident**: Rotate secrets and review access logs
4. **Performance issues**: Check prewarm status and endpoint response times

---

**🎉 Ready to deploy!** The system is designed for production reliability with comprehensive validation, monitoring, and automated deployment workflows.