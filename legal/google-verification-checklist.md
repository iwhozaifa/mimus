# Google OAuth verification checklist

Internal working doc, not published. Covers the steps for submitting Mimus to Google's OAuth verification (Google Cloud Console → Google Auth Platform → Verification Center).

## 1. Blockers to clear before submitting

- [ ] **Production domain** is live and verified in Google Search Console by a project Owner or Editor. [TODO: domain]
- [ ] **Hosting** is deployed. Vercel isn't set up yet (see PLAN.md, "External accounts").
- [ ] **Homepage** `/` is public and describes Mimus without signing in. It links to `/privacy` and `/terms`. _(Built in `app/page.tsx`.)_
- [ ] **Privacy Policy** is published at `https://[TODO: domain]/privacy`, with every `[TODO]` in `legal/privacy-policy.md` filled in and a lawyer's review done.
- [ ] **Terms of Service** is published at `https://[TODO: domain]/terms`.
- [ ] **Account deletion** works in the app (Settings → Account), and `/account-deletion` explains it publicly.
- [x] **Milestone 5 scopes are final.** M5 added `gmail.send` and `calendar.events`, requested only through incremental consent when a user clicks "Allow sending and booking" (`src/server/connectors/writeScopes.ts`). List all four scopes on the consent screen configuration.
- [ ] **CASA Tier 2 security assessment** is booked. It's required because `gmail.readonly` is a restricted scope. It is paid, must be done by a Google-approved assessor, takes weeks, and is renewed every year.

## 2. Consent screen fields (must match exactly everywhere)

- **App name:** `Mimus`. It must be identical on the consent screen, homepage `<title>`/heading and Privacy Policy.
- **Logo:** [TODO: 120×120 PNG]. Use the same logo on the homepage. Uploading a logo triggers brand verification.
- **User support email:** [TODO]
- **Application homepage:** `https://[TODO: domain]/`
- **Privacy policy link:** `https://[TODO: domain]/privacy`. Use the same URL that's linked from the homepage.
- **Terms of service link:** `https://[TODO: domain]/terms`
- **Authorized domains:** [TODO: domain]
- **Developer contact email:** [TODO]
- **Redirect URI:** `https://[TODO: domain]/api/connectors/google/callback`. This is the value of `GOOGLE_OAUTH_REDIRECT_URI`.

## 3. Scopes and their justifications

These are the only Google scopes Mimus requests. The two read-only scopes are requested on connect (`SCOPES` in `src/server/connectors/google/oauth.ts`); the two write scopes only when the user allows sending and booking for that account (`writeScopesFor('google')` in `src/server/connectors/writeScopes.ts`, using `include_granted_scopes` for incremental consent). It requests no `openid`, `email` or `profile` scope.

### `https://www.googleapis.com/auth/gmail.readonly` (restricted)

**Justification:**

> Mimus is an AI chief-of-staff for founders. It imports the user's last 90 days of email (excluding spam, trash, Promotions and Social), and keeps it current as new mail arrives. The user can then ask questions in plain language, such as "what did Acme say about the renewal?". Mimus answers with citations linking back to the original messages, and can draft replies that the user reviews. Answering questions about message content requires the full message body. `gmail.metadata` has no bodies, and `gmail.labels` and `gmail.send` don't fit. Mimus never modifies or deletes email; sending uses the separate, optional `gmail.send` scope below.

**Why a narrower scope won't work:** full-text search and summarization need message bodies.

### `https://www.googleapis.com/auth/calendar.readonly` (sensitive)

**Justification:**

> Mimus imports the user's calendar events so it can answer questions such as "when am I meeting Acme?", and checks free/busy time to suggest meeting slots. Creating events uses the separate, optional `calendar.events` scope below.

**Why a narrower scope won't work:** `calendar.freebusy` gives no titles or attendees, and Mimus needs those to answer questions about meetings. [TODO: re-check against current Google scope list before submitting]

### `https://www.googleapis.com/auth/gmail.send` (sensitive; optional, incremental)

**Justification:**

> When someone emails the user asking to meet, Mimus drafts a reply offering free times from the user's calendar (or their Calendly link). With the user's approval, or automatically if the user chose that approval level, Mimus sends that one reply from the user's Gmail, in the same thread, to the person who asked. The reply text comes from a fixed template, not free AI text. Mimus sends no other email. This scope is requested only when the user clicks "Allow sending and booking" for that account.

**Why a narrower scope won't work:** `gmail.send` is already the narrowest scope that can send. `gmail.compose` (restricted) would also allow managing drafts, which Mimus doesn't need.

### `https://www.googleapis.com/auth/calendar.events` (sensitive; optional, incremental)

**Justification:**

> When the user approves one of the offered times (or their approval level allows it), Mimus creates that meeting on their primary calendar with the other person invited (`sendUpdates: 'all'`, optional Google Meet link). Mimus doesn't change or delete existing events. Requested only when the user clicks "Allow sending and booking".

**Why a narrower scope won't work:** `calendar.events.owned` is a possible narrower option if it covers inserting on the primary calendar with attendees. [TODO: check `calendar.events.owned` against Google's current scope list before submitting, and switch to it if it fits]

[TODO: confirm the sensitive/restricted class of both write scopes on Google's current OAuth scope list before submitting]

## 4. Demo video script (unlisted YouTube; English UI; show the consent-screen URL bar)

1. Open `https://[TODO: domain]/`. Show the homepage, then the Privacy Policy link and its "Google user data" section.
2. Sign in, then go to **Settings → Connections → Connect Google**.
3. In the Google account chooser, show the **consent screen with the OAuth client ID visible in the URL**, then grant both scopes.
4. **`gmail.readonly` in use:** ask in the Ask bar, e.g. "Summarize what [contact] emailed me last week". Show the answer, then click a source link to open the original message.
5. **Draft reply:** ask Mimus to draft a reply. Show that it is a draft only and isn't sent.
6. **Turning on sending and booking:** on Connections, click **Allow sending and booking** for the account. Show the second, incremental consent screen listing `gmail.send` and `calendar.events`, and grant it. Show the "Can send and book" badge.
7. **`gmail.send` and `calendar.events` in use:** open an email asking to meet, click **Propose meeting times**, and show the drafted reply waiting on the Approvals page (approval level 2, the default). Click **Send these times**, then show the reply in the Gmail thread. Click **Book this time** and show the new event with the attendee invited in Google Calendar.
8. **Approval levels:** show Settings → Scheduling and the four levels, with level 2 as the default.
9. **`calendar.readonly` in use:** ask "What meetings do I have tomorrow?" and click an event source.
10. **Visibility:** show that the account is Private by default on the Connections page.
11. **Disconnect:** click Disconnect. Say aloud that imported data is deleted and the token is revoked. Optionally show the app removed at myaccount.google.com/permissions.
12. **Delete account:** show Settings → Account → Delete account.

## 5. Questions reviewers are likely to ask, and the answers

- **Is Google data sent to an AI model?** Yes, to OpenAI, but only to answer the user's own question, and only short excerpts: up to 1,500 characters per email and 500 per event description. Calls are made with `store: false` (`src/server/agent/providers/openai.ts`), and OpenAI doesn't train on API data. This is disclosed in Privacy Policy §3 and §5. [TODO: confirm Zero Data Retention status]
- **Is Google data used to train models?** No, and the policy says so explicitly.
- **Can the AI send email by itself?** Only within the user's approval level, only scheduling replies, only to the person who asked to meet, and only from accounts where the user granted `gmail.send`. The reply text is a fixed template (`src/server/scheduling/draftReply.ts`), so text inside an incoming email can't change what's sent or who receives it (adversarial test in `tests/server/scheduling/proposals.test.ts`). The default level requires approval for every send.
- **Can humans read it?** Not through the app. A connected account is Private by default and enforced by database row-level security (`can_see_connected_account`, `supabase/migrations/0005_connected_accounts.sql`). Staff access is limited to [TODO].
- **Is it shared with other users?** Only within the user's own organization's workspace, and only when the account's visibility is set to Team or Company.
  - **Risk:** a workspace **Owner** can widen any member's account visibility (`update_connected_accounts` policy in `0005_connected_accounts.sql`) without that member's approval. Reviewers may treat this as sharing a user's Gmail without their consent.
  - **Recommended fix before submitting:** only the account holder can raise their own account above Private.
- **How is it stored?** Supabase Postgres in [TODO: region]. Tokens are AES-256-GCM encrypted (`src/server/crypto/tokenVault.ts`), and all data is encrypted at rest by Supabase.
- **How is it deleted?**
  - Disconnect revokes the token and purges imported messages, events, contacts and tokens (`src/server/connectors/google/disconnect.ts`).
  - Account deletion does this for every connection (`src/server/account/deleteAccount.ts`).

## 6. Data-minimization items worth fixing before CASA

- **Raw copies:** `messages.raw` and `events.raw` store the full provider API response (Gmail is fetched with `format: 'full'`, `src/server/connectors/google/backfill.ts`). Reduce it to the fields actually used. Keep the `Message-ID` and `References` headers: scheduling replies thread with them (`src/server/connectors/google/write.ts`).
- **Retention:** there's no time-based limit on imported mail. Consider pruning data older than N days and stating that in the policy.
- **Member removal:** removing a member from a workspace (`app/(app)/members/actions.ts`, status `removed`) doesn't disconnect their services. Their data stays until they delete their account. Consider disconnecting on removal.
