import { resumeUnfinishedBackfills } from '@/src/server/connectors/resumeBackfills';
import { cronAuthError } from '@/src/server/http/cronAuth';
import { type NextRequest } from 'next/server';

// The Vercel Hobby limit. Raise to 800 on Pro (see README, "Deploying to
// Vercel"). An import still unfinished when this stops resumes next run.
export const maxDuration = 300;

// Restarts first imports a function time limit cut off. Scheduled by
// Vercel Cron (vercel.json); POST is for a manual run. Both need
// `Authorization: Bearer $CRON_SECRET`.
async function run(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const result = await resumeUnfinishedBackfills();
  return Response.json(result);
}

export const GET = run;
export const POST = run;
