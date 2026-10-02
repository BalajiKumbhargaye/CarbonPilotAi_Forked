import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { sendError } from '../utils/response';
import { UserRole, OrganizationType } from '@carbonpilot/shared';

export interface AuthUserPayload {
  userId: string;
  organizationId: string;
  organizationType: OrganizationType;
  role: UserRole;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication token required');
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Token format invalid');
    return;
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as AuthUserPayload;
    req.user = decoded;
    next();
  } catch (_err) {
    sendError(res, 401, 'INVALID_TOKEN', 'Token is expired or invalid');
  }
}
