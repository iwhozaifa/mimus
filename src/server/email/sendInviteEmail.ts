import { Resend } from 'resend';

export async function sendInviteEmail(params: {
  to: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Defaults to Resend's own sandbox sender, which works without a verified
  // domain (sending only to the account's own registered address). Set
  // RESEND_FROM_EMAIL once a real domain is verified.
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Mimus <onboarding@resend.dev>',
    to: [params.to],
    subject: `You've been invited to ${params.workspaceName} on Mimus`,
    html: `<p>You've been invited to join <strong>${params.workspaceName}</strong> on Mimus.</p>
<p><a href="${params.inviteUrl}">Accept the invite</a></p>`,
  });

  if (error) {
    throw error;
  }
}
