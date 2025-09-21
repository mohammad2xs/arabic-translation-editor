export type UserRole = 'viewer' | 'commenter' | 'reviewer';

export interface UserPermissions {
  canEdit: boolean;
  canApprove: boolean;
  canComment: boolean;
  canPlayAudio: boolean;
  canAddNotes: boolean;
  canSave: boolean;
  canShare: boolean;
}

const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  viewer: {
    canEdit: false,
    canApprove: false,
    canComment: false,
    canPlayAudio: true,
    canAddNotes: false,
    canSave: false,
    canShare: false,
  },
  commenter: {
    canEdit: false,
    canApprove: false,
    canComment: true,
    canPlayAudio: true,
    canAddNotes: true,
    canSave: false,
    canShare: false,
  },
  reviewer: {
    canEdit: true,
    canApprove: true,
    canComment: true,
    canPlayAudio: true,
    canAddNotes: true,
    canSave: true,
    canShare: true,
  },
};

export function getUserPermissions(role: UserRole): UserPermissions {
  return ROLE_PERMISSIONS[role];
}

export function canEdit(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canEdit;
}

export function canApprove(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canApprove;
}

export function canComment(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canComment;
}

export function canPlayAudio(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canPlayAudio;
}

export function canAddNotes(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canAddNotes;
}

export function canSave(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canSave;
}

export function canShare(role: UserRole): boolean {
  return ROLE_PERMISSIONS[role].canShare;
}

export function getRoleFromRequest(req: Request): UserRole {
  // Check x-user-role header first (set by middleware)
  const roleHeader = req.headers.get('x-user-role');
  if (roleHeader && isValidRole(roleHeader)) {
    return roleHeader as UserRole;
  }

  // Check user-role cookie as fallback
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const cookieRole = cookies['user-role'];
    if (cookieRole && isValidRole(cookieRole)) {
      return cookieRole as UserRole;
    }
  }

  return 'viewer';
}

export function readUserRoleFromCookie(): UserRole | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const role = cookies['user-role'];
  return role && isValidRole(role) ? (role as UserRole) : null;
}

export function getUserRole(token?: string): UserRole {
  if (typeof window === 'undefined') return 'viewer';

  // First try to read from cookie
  const cookieRole = readUserRoleFromCookie();
  if (cookieRole) {
    return cookieRole;
  }

  // Check for token in URL params only if cookie is missing
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');

  if (token || urlToken) {
    // Token validation would be handled by middleware
    // For client-side, we rely on cookies set by middleware
    // If no cookie but token exists, fallback to default localhost behavior
  }

  // Default to reviewer for localhost development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'reviewer';
  }

  return 'viewer';
}

export function formatRoleDisplay(role: UserRole): string {
  switch (role) {
    case 'viewer':
      return 'Viewer (Read-only)';
    case 'commenter':
      return 'Commenter (Can add notes)';
    case 'reviewer':
      return 'Reviewer (Full access)';
    default:
      return 'Unknown role';
  }
}

export function getRoleIcon(role: UserRole): string {
  switch (role) {
    case 'viewer':
      return '👁️';
    case 'commenter':
      return '💬';
    case 'reviewer':
      return '✏️';
    default:
      return '❓';
  }
}

export function isValidRole(role: string): role is UserRole {
  return ['viewer', 'commenter', 'reviewer'].includes(role);
}

export function validateRoleAccess(requiredRole: UserRole, userRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    viewer: 1,
    commenter: 2,
    reviewer: 3,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function getRestrictedMessage(action: string, requiredRole: UserRole): string {
  return `You need ${formatRoleDisplay(requiredRole)} access to ${action}. Please request appropriate permissions from the document owner.`;
}