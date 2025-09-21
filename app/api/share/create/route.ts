import { NextRequest, NextResponse } from 'next/server';
import { createToken, generateShareUrl } from '../../../../lib/share/magic';
import { isValidRole, type UserRole, getRoleFromRequest } from '../../../../lib/dadmode/access';

interface CreateShareRequest {
  role: UserRole;
  expiresAt: string;
  section?: string;
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

    const body: CreateShareRequest = await request.json();

    // Validate request data
    if (!body.role || !isValidRole(body.role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be viewer, commenter, or reviewer.' },
        { status: 400 }
      );
    }

    if (!body.expiresAt) {
      return NextResponse.json(
        { error: 'Expiration date is required.' },
        { status: 400 }
      );
    }

    const expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'Invalid expiration date. Must be in the future.' },
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

    // Create token
    const token = await createToken(body.role, expiresAt, body.section);

    // Generate share URL
    const baseUrl = new URL(request.url).origin;
    const shareUrl = generateShareUrl(baseUrl, token, body.section, 'dad');

    return NextResponse.json({
      success: true,
      link: shareUrl,
      token,
      role: body.role,
      section: body.section,
      expiresAt: body.expiresAt,
    });
  } catch (error) {
    console.error('Share creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create share link. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to create share links.' },
    { status: 405 }
  );
}