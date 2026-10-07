import { Resend } from 'resend';

export async function sendInviteEmail(params: {
  to: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No Resend account configured yet (every local/CI environment today) --
    // the invite row is already created either way, so log the link instead
    // of hard-failing the whole invite flow over a missing optional provider.
    console.info(`[sendInviteEmail] RESEND_API_KEY not set; invite link: ${params.inviteUrl}`);
    return;
  }

  const resend = new Resend(apiKey);
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
