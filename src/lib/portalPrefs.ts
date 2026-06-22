export type NotificationPrefs = {
  orderUpdates: boolean;
  coaReady: boolean;
  paymentReceipts: boolean;
  promotions: boolean;
};

export type TeamMember = {
  id: string;
  email: string;
  role: 'admin' | 'member';
  invitedAt: string;
};

const NOTIF_KEY = 'atlas_notification_prefs';
const TEAM_KEY = 'atlas_team_members';

export function loadNotificationPrefs(userId: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(`${NOTIF_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { orderUpdates: true, coaReady: true, paymentReceipts: true, promotions: false };
}

export function saveNotificationPrefs(userId: string, prefs: NotificationPrefs) {
  localStorage.setItem(`${NOTIF_KEY}_${userId}`, JSON.stringify(prefs));
}

export function loadTeamMembers(userId: string): TeamMember[] {
  try {
    const raw = localStorage.getItem(`${TEAM_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveTeamMembers(userId: string, members: TeamMember[]) {
  localStorage.setItem(`${TEAM_KEY}_${userId}`, JSON.stringify(members));
}
