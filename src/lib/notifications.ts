import { supabase } from './supabase';

export type NotificationType = 'order_update' | 'coa_ready' | 'payment_receipt' | 'promotion';

interface QueueOpts {
  userId: string;
  type: NotificationType;
  subject: string;
  body: string;
}

/** Queue an email notification. Inserts into notification_queue when the table exists. */
export async function queueNotification({ userId, type, subject, body }: QueueOpts): Promise<Error | null> {
  const row = {
    user_id: userId,
    channel: 'email',
    subject: `[Atlas] ${subject}`,
    body: `${body}\n\n—\nType: ${type}`,
  };
  const { error } = await supabase.from('notification_queue').insert(row);
  if (error) {
    if (!error.message.includes('notification_queue')) {
      console.warn('Notification queue failed:', error.message);
    }
    return new Error(error.message);
  }
  return null;
}

export async function notifyCoaReady(userId: string, sampleName: string, slug: string): Promise<Error | null> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return queueNotification({
    userId,
    type: 'coa_ready',
    subject: `COA ready — ${sampleName}`,
    body: `Your certificate of analysis for ${sampleName} is now available.\nView: ${origin}/coa/${slug}`,
  });
}

export async function notifyOrderUpdate(userId: string, orderNumber: string, status: string): Promise<Error | null> {
  return queueNotification({
    userId,
    type: 'order_update',
    subject: `Order ${orderNumber} — ${status}`,
    body: `Your order ${orderNumber} status is now: ${status}.`,
  });
}
