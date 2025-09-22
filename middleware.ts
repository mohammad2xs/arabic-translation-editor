import { NextRequest, NextResponse } from 'next/server';
import { validateToken } from './lib/share/magic';

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Only apply middleware to /tri routes
  if (!pathname.startsWith('/tri')) {
    return NextResponse.next();
  }

  const token = searchParams.get('token');

  if (token) {
    try {
      const validation = await validateToken(token);

      if (validation.valid && validation.role) {
        // Add role and token information to request headers for server components
        const response = NextResponse.next();
        response.headers.set('x-user-role', validation.role);
        response.headers.set('x-token-scope', validation.scope || '');
        response.headers.set('x-magic-token', token); // Pass token for rate limiting

        // Set cookies for client-side access
        response.cookies.set('user-role', validation.role, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24, // 24 hours
        });

        if (validation.scope) {
          response.cookies.set('token-scope', validation.scope, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 24 hours
          });
        }

        return response;
      } else if (validation.expired) {
        // Token is expired, redirect to error page or show message
        const url = request.nextUrl.clone();
        url.searchParams.delete('token');
        url.searchParams.set('error', 'token-expired');

        return NextResponse.redirect(url);
      } else {
        // Invalid token, fall back to viewer role
        const response = NextResponse.next();
        response.headers.set('x-user-role', 'viewer');
        response.cookies.set('user-role', 'viewer', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24,
        });

        return response;
      }
    } catch (error) {
      console.error('Middleware token validation error:', error);

      // On error, fall back to viewer role
      const response = NextResponse.next();
      response.headers.set('x-user-role', 'viewer');
      response.cookies.set('user-role', 'viewer', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
      });

      return response;
    }
  } else {
    // No token provided
    // For localhost, default to reviewer role for development
    const isLocalhost = request.nextUrl.hostname === 'localhost' ||
                       request.nextUrl.hostname === '127.0.0.1';

    const defaultRole = isLocalhost ? 'reviewer' : 'viewer';

    const response = NextResponse.next();
    response.headers.set('x-user-role', defaultRole);
    response.cookies.set('user-role', defaultRole, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};