/**
 * Drains notification_queue and sends email via Resend.
 *
 * Secrets (supabase secrets set):
 *   RESEND_API_KEY
 *   NOTIFY_FROM_EMAIL  (e.g. labs@atlasanalytics.io)
 *   SUPABASE_SERVICE_ROLE_KEY (auto in hosted functions)
 *   SUPABASE_URL (auto)
 *
 * Deploy: supabase functions deploy send-notifications
 * Schedule: cron every minute, or invoke manually.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'labs@atlasanalytics.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() });
  }

  try {
    if (!RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY not configured', sent: 0 }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rows, error } = await supabase
      .from('notification_queue')
      .select('id, user_id, subject, body, channel')
      .is('sent_at', null)
      .in('channel', ['email', 'sms'])
      .order('created_at', { ascending: true })
      .limit(25);

    if (error) return json({ error: error.message, sent: 0 }, 500);
    if (!rows?.length) return json({ sent: 0, message: 'Queue empty' });

    let sent = 0;
    const failures: string[] = [];
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
    const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';

    for (const row of rows) {
      const { data: userData } = await supabase.auth.admin.getUserById(row.user_id);
      const email = userData?.user?.email;

      if (row.channel === 'sms') {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('phone')
          .eq('id', row.user_id)
          .maybeSingle();
        const phone = (profile?.phone || '').trim();
        if (!phone) {
          failures.push(`${row.id}: no phone`);
          continue;
        }
        if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
          // Leave unsent so a later deploy with Twilio can drain; mark skipped note in failures.
          failures.push(`${row.id}: SMS queued but Twilio secrets not configured`);
          continue;
        }
        const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const body = new URLSearchParams({
          To: phone,
          From: TWILIO_FROM,
          Body: row.body,
        });
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        );
        if (!res.ok) {
          failures.push(`${row.id}: ${await res.text()}`);
          continue;
        }
      } else {
        if (!email) {
          failures.push(`${row.id}: no email`);
          continue;
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM,
            to: [email],
            subject: row.subject,
            text: row.body,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          failures.push(`${row.id}: ${text}`);
          continue;
        }
      }

      await supabase
        .from('notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', row.id);
      sent += 1;
    }

    return json({ sent, failures });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error', sent: 0 }, 500);
  }
});

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}
