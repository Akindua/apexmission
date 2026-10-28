// pages/api/welcome-email.ts (or app/api/welcome-email/route.ts)
// @ts-expect-error - optional deployment-only email integration
import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);

export default async function handler(req: any, res: any) {
  // 1. Secure the endpoint using a secret token shared between Supabase and Vercel
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env['SUPABASE_WEBHOOK_SECRET']}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Parse the payload sent by the Supabase Auth/User webhook
    const { record } = req.body; 
    const email = record.email;
    const firstName = record.raw_user_meta_data?.first_name || 'there';

    // 3. Fire the Resend API (Email 1)
    await resend.emails.send({
      from: 'ApexMissions <welcome@yourdomain.com>', // Replace with your verified Resend domain
      to: [email],
      subject: `🚀 Welcome to ApexMissions, ${firstName}! Let’s crush your goals.`,
      text: `Hey ${firstName},\n\nWelcome to ApexMissions. You’re officially in!\n\nMost goal trackers just sit on your phone and collect digital dust. ApexMissions is different. It is engineered as an execution engine to actively push, remind, and guide you toward finishing what you start.\n\nRight now, you have baseline access to our platform features powered by standard AI.\n\nTo help you get the absolute most out of your trial, here is your first "mission":\n1. Open the app.\n2. Set exactly ONE major goal you’ve been putting off.\n3. Let the system build your execution roadmap.\n\nIn a couple of days, I’m going to show you how our system forces execution so you don't lose momentum.\n\nStay focused,\nFounder, ApexMissions`,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
