# Arabic Translation Review App - Deployment Guide

This guide will help you deploy the Arabic translation review app to production with full PWA capabilities and mobile optimization.

## 🚀 Quick Start (Vercel Deployment)

### Prerequisites
- Node.js 18+
- Git repository
- Vercel account
- Email service account (Resend or SendGrid)

### 1. Deploy to Vercel

#### Option A: One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/arabic-review)

#### Option B: Manual Deploy
```bash
# Clone the repository
git clone https://github.com/your-username/arabic-review.git
cd arabic-review

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 2. Configure Environment Variables

In your Vercel dashboard, go to Project Settings → Environment Variables and add:

#### Required Variables
```env
# App Configuration
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
SHARE_KEY=your-secure-random-key-here
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=https://your-app.vercel.app

# Email Service (choose one)
EMAIL_SERVICE=resend
EMAIL_SERVICE_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@your-domain.com
FROM_NAME=Arabic Translation Review
```

#### Generate Secure Keys
```bash
# Generate SHARE_KEY
openssl rand -base64 32

# Generate NEXTAUTH_SECRET
openssl rand -base64 32
```

### 3. Set Up Vercel KV (Token Storage)

1. Go to Vercel Dashboard → Storage → Create Database
2. Select "KV" (Redis)
3. Create database named "arabic-review-tokens"
4. Environment variables will be auto-added to your project

### 4. Configure Email Service

#### Option A: Resend (Recommended)
1. Sign up at [resend.com](https://resend.com)
2. Create API key in [API Keys section](https://resend.com/api-keys)
3. Add to environment variables:
   ```env
   EMAIL_SERVICE=resend
   EMAIL_SERVICE_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

#### Option B: SendGrid
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create API key in Settings → API Keys
3. Add to environment variables:
   ```env
   EMAIL_SERVICE=sendgrid
   EMAIL_SERVICE_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 5. Test Deployment

1. Visit your deployed app
2. Test sharing functionality
3. Send a test email invitation
4. Test on mobile devices (iPhone/Android)

## 📱 Mobile Optimization Features

### Progressive Web App (PWA)
- ✅ Offline capability with service worker
- ✅ "Add to Home Screen" prompts
- ✅ iOS Safari optimizations
- ✅ Android Chrome installation
- ✅ App-like experience when installed

### iOS-Specific Features
- ✅ Safari viewport handling
- ✅ Status bar optimization
- ✅ Touch gesture improvements
- ✅ Native share integration
- ✅ Keyboard behavior fixes
- ✅ Safe area support

### Mobile Sharing
- ✅ Mobile-optimized email templates
- ✅ Installation instructions included
- ✅ Direct email sending with templates
- ✅ Copy-to-clipboard fallbacks
- ✅ iOS native sharing integration

## 🔧 Advanced Configuration

### Custom Domain

1. Add your domain in Vercel Project Settings → Domains
2. Update environment variables:
   ```env
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   NEXTAUTH_URL=https://your-domain.com
   ```

### Email Templates

Email templates are automatically mobile-optimized with:
- Dark mode support
- Responsive design
- iOS/Android installation instructions
- Clear call-to-action buttons

### Security Configuration

The app includes several security features:
- HMAC-signed tokens
- Automatic token expiry
- CORS protection
- Content Security Policy headers
- Rate limiting (configurable)

### Performance Optimization

- Service worker caching
- Static asset optimization
- Image optimization
- Font loading optimization
- API route caching

## 🛠️ Development Setup

### Local Development

```bash
# Clone and install
git clone https://github.com/your-username/arabic-review.git
cd arabic-review
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your values
nano .env.local

# Start development server
npm run dev
```

### Local Environment Variables

```env
# Development Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
SHARE_KEY=dev-key-change-in-production
NEXTAUTH_SECRET=dev-secret-change-in-production
NEXTAUTH_URL=http://localhost:3000

# For local email testing (optional)
EMAIL_SERVICE=resend
EMAIL_SERVICE_API_KEY=your-test-api-key
FROM_EMAIL=test@example.com
FROM_NAME=Arabic Review (Dev)

# Local Redis (if testing production storage)
KV_URL=redis://localhost:6379
```

### Testing Mobile Features

1. **iOS Testing:**
   ```bash
   # Serve on network for device testing
   npm run dev -- --host 0.0.0.0
   ```
   - Visit `http://your-ip:3000` on iPhone
   - Test "Add to Home Screen"
   - Test email sharing

2. **Android Testing:**
   - Use Chrome DevTools mobile emulation
   - Test PWA installation prompts
   - Verify email templates render correctly

## 📧 Email Service Setup Details

### Resend Configuration

1. **Domain Setup (Optional):**
   - Add your domain in Resend dashboard
   - Verify DNS records
   - Use your domain for FROM_EMAIL

2. **API Key Permissions:**
   - Ensure "Send" permission is enabled
   - Consider separate keys for dev/prod

### SendGrid Configuration

1. **Sender Authentication:**
   - Verify sender identity
   - Set up domain authentication
   - Configure DKIM/SPF records

2. **API Key Setup:**
   - Create restricted API key
   - Grant only "Mail Send" permission

## 🚨 Troubleshooting

### Common Issues

1. **Email not sending:**
   ```bash
   # Check API endpoint
   curl https://your-app.vercel.app/api/share/email?action=status

   # Should return:
   # {"configured": true, "service": "resend", "available": true}
   ```

2. **Token storage errors:**
   - Verify Vercel KV is connected
   - Check KV environment variables are set
   - Test with a simple token creation

3. **PWA not installing:**
   - Ensure HTTPS is enabled
   - Check manifest.json is accessible
   - Verify service worker registration

4. **Mobile layout issues:**
   - Test viewport meta tags
   - Check iOS CSS is loading
   - Verify touch target sizes

### Debug Mode

Enable debug logging:
```env
DEBUG=true
NODE_ENV=development
```

### Health Check Endpoints

- `GET /api/share/email?action=status` - Email service status
- `GET /manifest.json` - PWA manifest
- `GET /sw.js` - Service worker

## 📊 Monitoring & Analytics

### Error Tracking

Consider adding error tracking:
```env
# Optional: Sentry integration
SENTRY_DSN=https://your-sentry-dsn
```

### Usage Analytics

Monitor key metrics:
- Share link generation rate
- Email delivery success rate
- PWA installation rate
- Mobile vs desktop usage

### Logs

Check Vercel function logs for:
- Email sending status
- Token creation/validation
- API errors
- Performance metrics

## 🔒 Security Checklist

- [ ] Strong SHARE_KEY and NEXTAUTH_SECRET generated
- [ ] Environment variables properly set
- [ ] Email service API keys secured
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] Content Security Policy headers active
- [ ] Token expiry times configured appropriately
- [ ] Rate limiting enabled
- [ ] CORS origins restricted

## 🚀 Going Live

### Pre-Launch Checklist

1. **Test all features:**
   - [ ] Share link generation
   - [ ] Email sending and delivery
   - [ ] PWA installation on iOS/Android
   - [ ] Mobile responsiveness
   - [ ] Token expiry handling

2. **Performance check:**
   - [ ] Page load times < 3s
   - [ ] Service worker caching working
   - [ ] Images optimized
   - [ ] API response times < 1s

3. **Mobile testing:**
   - [ ] iPhone Safari installation
   - [ ] Android Chrome installation
   - [ ] Email template rendering
   - [ ] Touch interactions working
   - [ ] Keyboard behavior correct

### Launch Steps

1. Deploy to production
2. Test with real users (small group)
3. Monitor logs and metrics
4. Gather feedback
5. Iterate and improve

## 🎯 Post-Launch

### Maintenance

- Monitor error rates
- Update dependencies regularly
- Review and rotate API keys
- Clean up expired tokens
- Backup user data

### Feature Enhancements

Potential improvements:
- Push notifications
- Advanced analytics
- User authentication
- Bulk sharing
- Translation workflow integration

---

## 📞 Support

For deployment issues:
1. Check the troubleshooting section above
2. Review Vercel deployment logs
3. Test API endpoints individually
4. Verify environment variables

The app is designed to be production-ready with proper error handling, security measures, and mobile optimization for the best user experience.

**Happy deploying! 🚀**