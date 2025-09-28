import { NextRequest, NextResponse } from 'next/server';
import { sendShareEmail, generateShareLink, isValidEmail } from '../../../../lib/share/email';
import { isValidRole, type UserRole, getRoleFromRequest } from '../../../../lib/dadmode/access';

interface SendEmailRequest {
  toEmail: string;
  role: UserRole;
  section?: string;
  expiryHours?: number;
  senderName?: string;
  message?: string;
}

interface GenerateLinkRequest {
  role: UserRole;
  section?: string;
  expiryHours?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Check user role - only reviewers can create share links
    const userRole = getRoleFromRequest(request);

    // Allow relaxed access for localhost development
    const isLocalhost = new URL(request.url).hostname === 'localhost';

    if (!isLocalhost && userRole !== 'reviewer') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only reviewers can create share links.' },
        { status: 403 }
      );
    }

    const contentType = request.headers.get('content-type');
    const action = new URL(request.url).searchParams.get('action');

    if (!contentType?.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Handle different actions
    if (action === 'generate-link') {
      return await handleGenerateLink(body, request);
    } else {
      return await handleSendEmail(body, request);
    }
  } catch (error) {
    console.error('[Email API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    );
  }
}

async function handleSendEmail(body: SendEmailRequest, request: NextRequest) {
  // Validate email request data
  if (!body.toEmail || !isValidEmail(body.toEmail)) {
    return NextResponse.json(
      { error: 'Valid email address is required.' },
      { status: 400 }
    );
  }

  if (!body.role || !isValidRole(body.role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be viewer, commenter, reviewer, or admin.' },
      { status: 400 }
    );
  }

  // Validate section format if provided
  if (body.section && !/^S\d{3}$/.test(body.section)) {
    return NextResponse.json(
      { error: 'Invalid section format. Must be like S001, S002, etc.' },
      { status: 400 }
    );
  }

  // Validate expiry hours
  const expiryHours = body.expiryHours || 72;
  if (expiryHours < 1 || expiryHours > 168) { // 1 hour to 1 week
    return NextResponse.json(
      { error: 'Expiry hours must be between 1 and 168 (1 week).' },
      { status: 400 }
    );
  }

  // Validate message length if provided
  if (body.message && body.message.length > 500) {
    return NextResponse.json(
      { error: 'Message must be 500 characters or less.' },
      { status: 400 }
    );
  }

  // Validate sender name length if provided
  if (body.senderName && body.senderName.length > 100) {
    return NextResponse.json(
      { error: 'Sender name must be 100 characters or less.' },
      { status: 400 }
    );
  }

  try {
    // Get base URL from request origin
    const origin = request.headers.get('origin') ||
                  `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    const result = await sendShareEmail({
      toEmail: body.toEmail,
      role: body.role,
      section: body.section,
      expiryHours,
      senderName: body.senderName,
      message: body.message,
      baseUrl: origin,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Email sent successfully',
        shareUrl: result.shareUrl,
        token: result.token,
        role: body.role,
        section: body.section,
        expiryHours,
        sentTo: body.toEmail,
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Email API] Send email error:', error);
    return NextResponse.json(
      { error: 'Failed to send email. Please check your email service configuration.' },
      { status: 500 }
    );
  }
}

async function handleGenerateLink(body: GenerateLinkRequest, request: NextRequest) {
  // Validate link generation request data
  if (!body.role || !isValidRole(body.role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be viewer, commenter, reviewer, or admin.' },
      { status: 400 }
    );
  }

  // Validate section format if provided
  if (body.section && !/^S\d{3}$/.test(body.section)) {
    return NextResponse.json(
      { error: 'Invalid section format. Must be like S001, S002, etc.' },
      { status: 400 }
    );
  }

  // Validate expiry hours
  const expiryHours = body.expiryHours || 72;
  if (expiryHours < 1 || expiryHours > 168) { // 1 hour to 1 week
    return NextResponse.json(
      { error: 'Expiry hours must be between 1 and 168 (1 week).' },
      { status: 400 }
    );
  }

  try {
    // Get base URL from request origin
    const origin = request.headers.get('origin') ||
                  `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    const result = await generateShareLink(body.role, body.section, expiryHours, origin);

    if (result.success) {
      return NextResponse.json({
        success: true,
        shareUrl: result.shareUrl,
        token: result.token,
        role: body.role,
        section: body.section,
        expiryHours,
        expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to generate link' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Email API] Generate link error:', error);
    return NextResponse.json(
      { error: 'Failed to generate share link. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const action = new URL(request.url).searchParams.get('action');

    if (action === 'status') {
      // Return email service status
      const { getEmailServiceStatus } = await import('../../../../lib/share/email');
      const status = getEmailServiceStatus();

      return NextResponse.json({
        configured: status.configured,
        service: status.service,
        available: status.hasApiKey,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid action. Use POST to send emails or generate links.',
        availableActions: {
          'POST /api/share/email': 'Send email with share link',
          'POST /api/share/email?action=generate-link': 'Generate share link without sending email',
          'GET /api/share/email?action=status': 'Check email service status'
        }
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Email API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to process request.' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}