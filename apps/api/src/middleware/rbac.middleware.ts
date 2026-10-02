import { Request, Response, NextFunction } from 'express';
import { UserRole, OrganizationType } from '@carbonpilot/shared';
import { sendError } from '../utils/response';

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Requires one of roles: ${roles.join(', ')}`
      );
      return;
    }

    next();
  };
}

export function requireOrganizationType(...types: OrganizationType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    if (!types.includes(req.user.organizationType)) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Requires organization type: ${types.join(', ')}`
      );
      return;
    }

    next();
  };
}
