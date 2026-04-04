import { Request, Response, NextFunction } from 'express';
import jwt                                 from 'jsonwebtoken';
import { env }                             from '../../core/config/env';
import { JwtPayload, OrgRole }             from '../../core/domain/auth.types';

// ----------------------------------------------------------------
// authenticate
// Verifies the JWT in the Authorization header.
// On success: attaches decoded payload to req.user and calls next().
// On failure: returns 401 immediately.
// ----------------------------------------------------------------
export function authenticate(
req:  Request,
res:  Response,
next: NextFunction
): void {
const authHeader = req.headers.authorization;

if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
    success: false,
    error: {
        code:    'MISSING_TOKEN',
        message: 'Authorization header with Bearer token is required',
    },
    });
    return;
}

const token = authHeader.slice(7);   // strip "Bearer "

try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
} catch (err) {
    const message = err instanceof jwt.TokenExpiredError
    ? 'Token has expired'
    : 'Invalid token';

    res.status(401).json({
    success: false,
    error: { code: 'INVALID_TOKEN', message },
    });
}
}

// ----------------------------------------------------------------
// requireRole
// RBAC guard — use after authenticate() in the middleware chain.
// Usage: router.post('/', authenticate, requireRole('supplier'), handler)
// ----------------------------------------------------------------
export function requireRole(...allowedRoles: OrgRole[]) {
return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
    res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
    }

    if (!allowedRoles.includes(req.user.role)) {
    res.status(403).json({
        success: false,
        error: {
        code:    'FORBIDDEN',
        message: `Role '${req.user.role}' is not permitted to perform this action`,
        },
    });
    return;
    }

    next();
};
}