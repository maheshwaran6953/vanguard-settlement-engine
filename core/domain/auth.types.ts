// The decoded payload inside every JWT this platform issues.
// This is what req.user contains after the auth middleware runs.
export interface JwtPayload {
  sub:     string;          // organisation id (UUID) — the canonical actor identity
  email:   string;
  role:    OrgRole;
  org_id:  string;          // same as sub — explicit for readability
  iat?:    number;          // issued at (set by jsonwebtoken)
  exp?:    number;          // expiry (set by jsonwebtoken)
}

export type OrgRole = 'supplier' | 'buyer' | 'platform_admin';

// Extends Express Request so TypeScript knows req.user exists
// after the auth middleware has run.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}