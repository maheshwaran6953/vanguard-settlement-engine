import { Router, Request, Response, NextFunction } from 'express';
import { authService }                             from '../../../core/database/container';
import { RegisterSchema, LoginSchema }             from './auth.schemas';
import { loginLimiter, registrationLimiter }       from '../../middleware/rate-limiter';

export const authRouter = Router();

function asyncHandler(
fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
};
}

// POST /auth/register — registration limiter first, then handler
authRouter.post(
'/register',
registrationLimiter,
asyncHandler(async (req, res) => {
    const body   = RegisterSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json({ success: true, data: result });
})
);

// POST /auth/login — login limiter first, then handler
authRouter.post(
'/login',
loginLimiter,
asyncHandler(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    const result = await authService.login(email, password);
    res.status(200).json({ success: true, data: result });
})
);