import { Resend } from 'resend';

export async function sendInviteEmail(params: {
  to: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'Mimus <invites@mimus.app>',
    to: [params.to],
    subject: `You've been invited to ${params.workspaceName} on Mimus`,
    html: `<p>You've been invited to join <strong>${params.workspaceName}</strong> on Mimus.</p>
<p><a href="${params.inviteUrl}">Accept the invite</a></p>`,
  });

  if (error) {
    throw error;
  }
}
