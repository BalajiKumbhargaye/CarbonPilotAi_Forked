import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { NotificationModel } from '../../models/Notification';
import { AppError, sendSuccess } from '../../utils/response';
import { authenticate } from '../../middleware/auth.middleware';

export class NotificationService {
  async getNotifications(userId: string) {
    return NotificationModel.find({ userId }).sort({ createdAt: -1 });
  }

  async markAsRead(id: string, userId: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true }
    );
    if (!notification) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    return notification;
  }

  async markAllAsRead(userId: string) {
    return NotificationModel.updateMany({ userId }, { read: true });
  }
}

export const notificationService = new NotificationService();

export class NotificationController {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const notifications = await notificationService.getNotifications(req.user!.userId);
      return sendSuccess(res, notifications);
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await notificationService.markAsRead(req.params.id as string, req.user!.userId);
      return sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      await notificationService.markAllAsRead(req.user!.userId);
      return sendSuccess(res, { message: 'All notifications marked as read' });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);
notificationRoutes.get('/', (req, res, next) => notificationController.getNotifications(req, res, next));
notificationRoutes.put('/:id/read', (req, res, next) => notificationController.markAsRead(req, res, next));
notificationRoutes.put('/read-all', (req, res, next) => notificationController.markAllAsRead(req, res, next));
