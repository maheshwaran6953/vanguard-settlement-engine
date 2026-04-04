import { Router, Request, Response, NextFunction } from 'express';
import { authService }    from '../../../core/database/container';
import { RegisterSchema, LoginSchema } from './auth.schemas';

export const authRouter = Router();

function asyncHandler(
fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
};
}

// POST /auth/register
authRouter.post(
'/register',
asyncHandler(async (req, res) => {
    const body   = RegisterSchema.parse(req.body);
    const result = await authService.register(body);
    res.status(201).json({ success: true, data: result });
})
);

// POST /auth/login
authRouter.post(
'/login',
asyncHandler(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    const result = await authService.login(email, password);
    res.status(200).json({ success: true, data: result });
})
);