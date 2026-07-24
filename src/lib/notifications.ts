import { supabase } from './supabase';
import { loadNotificationPrefs } from './portalPrefs';

export type NotificationType = 'order_update' | 'coa_ready' | 'payment_receipt' | 'promotion';

export type OrderNotifyStage =
  | 'submitted'
  | 'payment_confirmed'
  | 'payment_waived'
  | 'awaiting_sample'
  | 'sample_received'
  | 'processing'
  | 'analyzing'
  | 'in_review'
  | 'complete'
  | 'coa_published'
  | 'eta_updated'
  | string;

interface QueueOpts {
  userId: string;
  type: NotificationType;
  subject: string;
  body: string;
}

interface ProfileNotifyRow {
  phone?: string | null;
  notify_email?: boolean | null;
  notify_sms?: boolean | null;
}

async function loadProfileNotify(userId: string): Promise<ProfileNotifyRow | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('phone, notify_email, notify_sms')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('Profile notify prefs unavailable:', error.message);
    return null;
  }
  return data as ProfileNotifyRow;
}

function stageCopy(orderNumber: string, stage: OrderNotifyStage, extra?: string): { subject: string; body: string } {
  const ref = `Order ${orderNumber}`;
  switch (stage) {
    case 'submitted':
      return {
        subject: `${ref} received`,
        body: `We received your order ${orderNumber}. Next: ship your samples using the checklist in your portal.`,
      };
    case 'payment_confirmed':
      return {
        subject: `${ref} — payment confirmed`,
        body: `Payment for order ${orderNumber} is confirmed. You can ship your samples when ready.`,
      };
    case 'payment_waived':
      return {
        subject: `${ref} — payment waived`,
        body: `Payment for order ${orderNumber} was waived. You can ship your samples when ready.`,
      };
    case 'awaiting_sample':
      return {
        subject: `${ref} — awaiting your shipment`,
        body: `Order ${orderNumber} is waiting for samples to arrive at the lab. Follow your shipping checklist in the portal.`,
      };
    case 'sample_received':
      return {
        subject: `${ref} — samples received`,
        body: `Your samples for order ${orderNumber} were received at Atlas Lab and are entering the testing queue.${extra ? ` ${extra}` : ''}`,
      };
    case 'processing':
      return {
        subject: `${ref} — processing`,
        body: `Order ${orderNumber} is being prepared for analysis.`,
      };
    case 'analyzing':
      return {
        subject: `${ref} — testing in progress`,
        body: `Lab testing is underway for order ${orderNumber}.`,
      };
    case 'in_review':
      return {
        subject: `${ref} — in review`,
        body: `Results for order ${orderNumber} are under lab review before the COA is published.`,
      };
    case 'complete':
      return {
        subject: `${ref} — complete`,
        body: `Order ${orderNumber} is complete. Your certificates are available in the portal.`,
      };
    case 'coa_published':
      return {
        subject: `${ref} — COA published`,
        body: `A certificate of analysis for order ${orderNumber} is now published.${extra ? ` ${extra}` : ''}`,
      };
    case 'eta_updated':
      return {
        subject: `${ref} — estimated ready date updated`,
        body: `The estimated ready date for order ${orderNumber} is now ${extra || 'updated'}. Check your portal for details.`,
      };
    default:
      return {
        subject: `${ref} — ${stage}`,
        body: `Your order ${orderNumber} status is now: ${stage}.${extra ? ` ${extra}` : ''}`,
      };
  }
}

function typeAllowed(
  type: NotificationType,
  profile: ProfileNotifyRow | null,
  local: ReturnType<typeof loadNotificationPrefs>,
): boolean {
  const emailOn = profile?.notify_email ?? true;
  if (!emailOn && type !== 'coa_ready') {
    // SMS may still send; email gate handled per channel below
  }
  switch (type) {
    case 'order_update':
      return local.orderUpdates;
    case 'coa_ready':
      return local.coaReady;
    case 'payment_receipt':
      return local.paymentReceipts;
    case 'promotion':
      return local.promotions;
    default:
      return true;
  }
}

/** Queue email and/or SMS notifications based on profile + local prefs. */
export async function queueNotification({
  userId,
  type,
  subject,
  body,
}: QueueOpts): Promise<Error | null> {
  const profile = await loadProfileNotify(userId);
  const local = loadNotificationPrefs(userId);
  if (!typeAllowed(type, profile, local)) return null;

  const emailAllowed = profile?.notify_email ?? true;
  const smsAllowed = profile?.notify_sms ?? false;
  const phone = (profile?.phone || '').trim();

  const rows: Array<{ user_id: string; channel: string; subject: string; body: string }> = [];

  if (emailAllowed) {
    rows.push({
      user_id: userId,
      channel: 'email',
      subject: `[Atlas] ${subject}`,
      body: `${body}\n\n—\nType: ${type}`,
    });
  }

  if (smsAllowed && phone) {
    rows.push({
      user_id: userId,
      channel: 'sms',
      subject: subject.slice(0, 40),
      body: `${body} Reply STOP to opt out.`.slice(0, 320),
    });
  }

  if (!rows.length) return null;

  const { error } = await supabase.from('notification_queue').insert(rows);
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

export async function notifyOrderUpdate(
  userId: string,
  orderNumber: string,
  status: OrderNotifyStage,
  extra?: string,
): Promise<Error | null> {
  const copy = stageCopy(orderNumber, status, extra);
  return queueNotification({
    userId,
    type: 'order_update',
    subject: copy.subject,
    body: copy.body,
  });
}

export async function notifyOrderEtaUpdated(
  userId: string,
  orderNumber: string,
  readyDateLabel: string,
): Promise<Error | null> {
  return notifyOrderUpdate(userId, orderNumber, 'eta_updated', readyDateLabel);
}
