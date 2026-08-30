import { createNativeModule, type NativeModuleSubscription, type NativePermissionStatus } from '@stingjs/modules-core';

const nativeNotifications = createNativeModule('Notifications');
const NOTIFICATIONS_PERMISSION = 'notifications';

export type NotificationsPermissionStatus = NativePermissionStatus;
export interface NotificationContent { title: string; body?: string; }
export interface ScheduleNotificationOptions extends NotificationContent { id?: string; at?: number; }
export interface ScheduledNotification extends NotificationContent { id: string; at: number | null; }
export interface NotificationEvent extends NotificationContent { id: string; }

function normalizeScheduled(value: unknown): ScheduledNotification {
  if (!value || typeof value !== 'object') throw new TypeError('Notifications returned invalid scheduled data.');
  const record = value as Record<string, unknown>;
  return { id: typeof record.id === 'string' ? record.id : '', title: typeof record.title === 'string' ? record.title : '', body: typeof record.body === 'string' ? record.body : undefined, at: typeof record.at === 'number' ? record.at : null };
}
function normalizeEvent(value: unknown): NotificationEvent {
  const scheduled = normalizeScheduled(value);
  return { id: scheduled.id, title: scheduled.title, body: scheduled.body };
}

export const Notifications = {
  isAvailable(): boolean { return nativeNotifications.isAvailable(); },
  getPermissionStatus(): NotificationsPermissionStatus { return nativeNotifications.permissionStatus(NOTIFICATIONS_PERMISSION); },
  requestPermission(): Promise<NotificationsPermissionStatus> { return nativeNotifications.requestPermission(NOTIFICATIONS_PERMISSION); },
  schedule(options: ScheduleNotificationOptions): Promise<string> {
    if (!options.title.trim()) return Promise.reject(new TypeError('Notification title must not be empty.'));
    return nativeNotifications.callAsync('schedule', [options.id ?? '', options.title, options.body ?? '', options.at ?? 0]);
  },
  async getScheduled(): Promise<ScheduledNotification[]> {
    const value = await nativeNotifications.callAsync('getScheduled');
    if (!Array.isArray(value)) throw new TypeError('Notifications returned an invalid scheduled list.');
    return value.map(normalizeScheduled);
  },
  async cancel(id: string): Promise<void> { if (!id.trim()) throw new TypeError('Notification id must not be empty.'); await nativeNotifications.callAsync('cancel', [id]); },
  addReceivedListener(listener: (event: NotificationEvent) => void): NativeModuleSubscription { return nativeNotifications.addListener('received', value => listener(normalizeEvent(value))); },
  addOpenedListener(listener: (event: NotificationEvent) => void): NativeModuleSubscription { return nativeNotifications.addListener('opened', value => listener(normalizeEvent(value))); },
};
