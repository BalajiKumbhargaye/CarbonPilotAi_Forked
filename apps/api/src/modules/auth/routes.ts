import { Router } from 'express';
import { authController } from './controller';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@carbonpilot/validation';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);

authRoutes.post('/login', validate(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

authRoutes.get('/me', authenticate, (req, res, next) =>
  authController.me(req, res, next)
);

authRoutes.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  (req, res, next) => authController.forgotPassword(req, res, next)
);

authRoutes.post(
  '/reset-password',
  validate(resetPasswordSchema),
  (req, res, next) => authController.resetPassword(req, res, next)
);
