import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../src/modules/notifications';

const state = vi.hoisted(() => ({
  updated: null as unknown,
  query: null as null | Record<string, unknown>,
}));

vi.mock('../src/models/Notification', () => ({
  NotificationModel: {
    findOneAndUpdate: vi.fn(async (query: Record<string, unknown>) => {
      state.query = query;
      return state.updated;
    }),
  },
}));

describe('notification authorization', () => {
  const service = new NotificationService();
  const notificationId = new mongoose.Types.ObjectId().toString();
  const currentUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    state.updated = { _id: notificationId, userId: currentUserId, read: true };
    state.query = null;
  });

  it('scopes notification read updates to the authenticated user', async () => {
    await service.markAsRead(notificationId, currentUserId);

    expect(state.query).toEqual({ _id: notificationId, userId: currentUserId });
  });

  it('returns not found when a notification is not owned by the current user', async () => {
    state.updated = null;

    await expect(service.markAsRead(notificationId, currentUserId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('does not query MongoDB with an invalid notification id', async () => {
    await expect(service.markAsRead('not-an-object-id', currentUserId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(state.query).toBeNull();
  });
});
