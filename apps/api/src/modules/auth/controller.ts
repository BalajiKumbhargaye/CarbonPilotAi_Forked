import { Request, Response, NextFunction } from 'express';
import { authService } from './service';
import { sendSuccess } from '../../utils/response';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });
      }
      const result = await authService.getMe(req.user.userId);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      // Placeholder response foundation
      return sendSuccess(res, {
        message: 'Password reset instructions have been dispatched if the account exists.',
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      // Placeholder response foundation
      return sendSuccess(res, {
        message: 'Password has been successfully updated.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
