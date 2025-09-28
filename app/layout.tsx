import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import '../styles/ios.css';

export const metadata: Metadata = {
  title: 'Arabic Translation Review',
  description: 'Dad-friendly Arabic translation review and approval app optimized for mobile',
  keywords: ['Arabic', 'translation', 'review', 'mobile', 'PWA', 'iOS'],
  authors: [{ name: 'Arabic Review Team' }],
  creator: 'Arabic Review Team',
  publisher: 'Arabic Review Team',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // PWA metadata
  applicationName: 'Arabic Review',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Arabic Review',
  },
  // Social sharing
  openGraph: {
    title: 'Arabic Translation Review',
    description: 'Dad-friendly Arabic translation review and approval app',
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'ar_SA',
    siteName: 'Arabic Review',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arabic Translation Review',
    description: 'Dad-friendly Arabic translation review and approval app',
  },
  // Security
  robots: {
    index: false, // Don't index review pages for privacy
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
  // Mobile optimizations
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Arabic Review',
    'application-name': 'Arabic Review',
    'msapplication-TileColor': '#2563eb',
    'msapplication-config': '/browserconfig.xml',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Favicon and icons */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />

        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* iOS Safari optimizations */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Arabic Review" />
        <meta name="apple-touch-fullscreen" content="yes" />

        {/* Disable automatic detection */}
        <meta name="format-detection" content="telephone=no, date=no, email=no, address=no" />


        {/* DNS prefetch */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
      </head>
      <body className="h-full bg-white text-gray-900 antialiased">
        {children}

        {/* Service Worker Registration */}
        <Script
          id="sw-registration"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);

                      // Check for updates
                      registration.addEventListener('updatefound', function() {
                        const newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              // New update available, notify user
                              if (window.confirm('A new version is available. Reload to update?')) {
                                window.location.reload();
                              }
                            }
                          });
                        }
                      });
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />

        {/* PWA Install Prompt */}
        <Script
          id="pwa-install"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              let deferredPrompt;

              window.addEventListener('beforeinstallprompt', function(e) {
                // Prevent Chrome 67 and earlier from automatically showing the prompt
                e.preventDefault();
                // Stash the event so it can be triggered later
                deferredPrompt = e;

                // Show install button or banner after a delay
                setTimeout(function() {
                  if (deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches) {
                    showInstallPrompt();
                  }
                }, 5000);
              });

              function showInstallPrompt() {
                if (deferredPrompt) {
                  // Create a simple install banner
                  const banner = document.createElement('div');
                  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#2563eb;color:white;padding:12px;text-align:center;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
                  banner.innerHTML = '📱 Install Arabic Review app for better experience <button onclick="installPWA()" style="background:white;color:#2563eb;border:none;padding:4px 8px;margin-left:8px;border-radius:4px;cursor:pointer;">Install</button> <button onclick="dismissInstall()" style="background:transparent;color:white;border:1px solid white;padding:4px 8px;margin-left:4px;border-radius:4px;cursor:pointer;">Later</button>';

                  window.installPWA = function() {
                    if (deferredPrompt) {
                      deferredPrompt.prompt();
                      deferredPrompt.userChoice.then(function(choiceResult) {
                        if (choiceResult.outcome === 'accepted') {
                          console.log('User accepted the install prompt');
                        }
                        deferredPrompt = null;
                        banner.remove();
                      });
                    }
                  };

                  window.dismissInstall = function() {
                    banner.remove();
                    // Don't show again for this session
                    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
                  };

                  // Only show if not already dismissed this session
                  if (!sessionStorage.getItem('pwa-prompt-dismissed')) {
                    document.body.prepend(banner);
                  }
                }
              }

              // iOS Safari install instructions
              function isIOS() {
                return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
              }

              function isStandalone() {
                return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
              }

              if (isIOS() && !isStandalone()) {
                setTimeout(function() {
                  if (!sessionStorage.getItem('ios-install-prompted')) {
                    const banner = document.createElement('div');
                    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.9);color:white;padding:16px;text-align:center;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
                    banner.innerHTML = '📱 Install: Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> <button onclick="this.parentElement.remove();sessionStorage.setItem(\\'ios-install-prompted\\',\\'true\\')" style="background:white;color:black;border:none;padding:4px 8px;margin-left:8px;border-radius:4px;">Got it</button>';
                    document.body.appendChild(banner);
                  }
                }, 3000);
              }
            `,
          }}
        />

        {/* iOS viewport height fix */}
        <Script
          id="ios-viewport-fix"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              function setViewportHeight() {
                let vh = window.innerHeight * 0.01;
                document.documentElement.style.setProperty('--vh', vh + 'px');
              }

              setViewportHeight();
              window.addEventListener('resize', setViewportHeight);
              window.addEventListener('orientationchange', function() {
                setTimeout(setViewportHeight, 500);
              });
            `,
          }}
        />
      </body>
    </html>
  );
}