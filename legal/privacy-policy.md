# Privacy Policy

**Effective date:** [TODO: publish date]

> **Draft — have this reviewed by a qualified lawyer before publishing.** Every `[TODO: …]` must be filled in or removed first.

This Privacy Policy explains what personal information Mimus collects, why, who it goes to, how long we keep it, and the choices you have. It covers the Mimus web app at [TODO: domain, e.g. https://mimus.app] ("Mimus", "the Service").

## 1. Who we are

Mimus is provided by [TODO: legal entity name], based in Pakistan ("we", "us").

- Privacy contact: [TODO: privacy email address]
- Postal address: [TODO: registered address]

### Our role

Mimus is a business tool that a company ("your organization") sets up for its team.

- **Account and billing information.** For your Mimus account, workspace and billing details, we are the data controller.
- **Workspace content.** For the email, calendar, Slack and Calendly data that members connect, we process it on behalf of your organization, which acts as the controller. We do so under our agreement with them [TODO: link the customer agreement / Data Processing Agreement]. If you're a member of an organization's workspace, contact your organization about its handling of that data. You can also contact us directly and we will help.

## 2. Information we collect

### Information you give us

- **Account details:** your email address (you sign in with a one-time email link, not a password) and, optionally, your full name.
- **Organization details:** your company name and workspace name, your role in the workspace (Owner, Manager or Member), and who your manager is.
- **Invitations:** when you invite a teammate, we store their email address, the role you chose and an invitation link token, and we email them the invitation.
- **Questions you ask Mimus:** the questions you type into the Ask bar. These are processed to produce an answer but are **not** saved after the answer is returned (see section 4).

### Information from services you connect

Mimus only reads data from services you explicitly connect. Connecting is optional, and you can disconnect at any time. Section 3 covers Google in detail. For every connected service:

- **Email (Gmail or Microsoft Outlook):**
  - What we store: subject line, sender, recipients (To, Cc and Bcc), date, preview snippet, the full message body (plain text and HTML), conversation (thread) ID, whether it was sent or received, and a copy of the message record as returned by the provider's API, including its headers.
  - When you first connect, we import the last 90 days. For Gmail, we skip spam, trash, and the Promotions and Social categories.
- **Calendar (Google Calendar or Microsoft Outlook calendar):**
  - What we store: event title, description, location, start and end time, status, organizer, attendees and their responses, and a copy of the event record as returned by the provider's API.
  - When you first connect, we import events from the last 90 days onward, including upcoming events.
- **Slack:**
  - What we store: messages from public and private channels **you are a member of**, from the last 90 days onward.
  - We never request access to direct messages or group DMs, and we filter them out again if one ever arrives.
- **Calendly:** your scheduled events and their invitees, from 90 days ago to one year ahead. We never create, change or cancel bookings.
- **People in your data:** to show who a message or meeting involves, we store the names and email addresses of senders, recipients and attendees found in your connected data. These may be people who don't use Mimus.
- **Access tokens:** the tokens each service issues so Mimus can read your data. We encrypt them with AES-256-GCM before storing them, and they are never shown to anyone in the app.

### Information collected automatically

- **Sign-in session cookies,** which keep you signed in, plus short-lived cookies that protect the connect-a-service flow against forgery. We use no advertising or analytics cookies.
- **AI usage log:** each time you ask Mimus a question, we record:
  - who asked, in which workspace, and when
  - the kind of request and its priority
  - which AI model answered
  - how many tokens it used and what it cost
  - which items were cited as sources
  - whether it succeeded

  It does **not** contain your question or the answer. Workspace Owners can see this log.

- **Service logs:** our hosting and database providers keep standard technical logs (such as IP address, request time and error details) for security and troubleshooting. [TODO: confirm hosting provider log retention once production hosting is set up]

### Information we do not collect

We do not collect your location, device identifiers, advertising identifiers, phone contacts, photos, camera or microphone input, or payment card numbers. Card payments are entered directly on Stripe's checkout page and never reach our servers.

## 3. Google user data

This section describes exactly what Mimus does with data it receives from Google APIs when you click **Connect Google** on the Connections page.

### What we request

Mimus requests two **read-only** permissions:

- **Read your Gmail messages and settings** (`https://www.googleapis.com/auth/gmail.readonly`)
- **View your Google Calendar events** (`https://www.googleapis.com/auth/calendar.readonly`)

Mimus does not request permission to send, delete or change email, or to create, change or delete calendar events. Signing in to Mimus itself does not use your Google account.

### How we use it

- **Gmail:**
  - We read your Gmail address to identify which account you connected.
  - We import your messages as described in section 2 so that you can search them, and so that Mimus's AI can find relevant messages, summarize them and answer questions you ask.
  - When the AI drafts an email for you, it can use a message you choose to reply to. Drafts are shown to you only and are never sent automatically.
- **Google Calendar:** we import your events so you can see your schedule in Mimus, and so the AI can answer questions about your meetings and suggest times when you're free.

We use Google user data only to provide and improve these user-facing features. "Improve" here means fixing problems you or Mimus run into. It does not mean training AI models.

### How we share it

- **With people in your organization's workspace, based on its visibility setting.** Each connected account is **Private** by default: only you can see its data, and not even the workspace's Owners can see it. It can be changed on the Connections page to:
  - **Team:** your manager, teammates who report to the same manager, and the workspace's Owners can also see it.
  - **Company:** the workspace's Owners, plus specific people an Owner adds to that account's sharing list, can also see it.

  Who can make this change:
  - You can always set your own account back to Private.
  - Setting it to Team or Company requires the Owner or Manager role.
  - Your workspace's Owners can also change the visibility of any connected account in the workspace, including yours.

  [TODO: decide whether to require the account holder's own approval before anyone else widens visibility. See the verification checklist.]

- **With our AI provider, to answer your question.** When you ask Mimus a question, short excerpts of relevant messages and events go to OpenAI to generate the answer: up to 1,500 characters of each email and 500 characters of each event description. See section 5.
- **With our infrastructure providers,** who store and process data on our behalf under contract (section 5).

We do not share Google user data with anyone else, except where required by law (section 5).

### Our commitments

- We **do not sell** Google user data.
- We **do not use** Google user data for advertising, including personalized, retargeted or interest-based ads.
- We **do not use** Google user data to train, develop or improve generalized or non-personalized AI or machine-learning models, and we do not allow our AI provider to do so.
- We **do not allow humans to read** Google user data, except:
  - with your explicit permission for specific messages, such as when you ask us for support;
  - when needed for security purposes, such as investigating abuse;
  - to comply with applicable law;
  - in aggregated, anonymized form for internal operations.

[TODO: describe the internal access controls that restrict which staff can access the production database]

### Limited Use

Mimus's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

### Storage, retention and removal

- **Storage:** Google data is stored in our database (section 7). Access tokens are encrypted with AES-256-GCM.
- **Retention:** we keep imported data while your Google account stays connected.
- **When you click Disconnect:**
  - We revoke Mimus's access with Google.
  - We immediately delete the imported messages, events, contacts and stored tokens for that account.
- **Revoking from Google:** you can also revoke access at any time from your [Google Account permissions page](https://myaccount.google.com/permissions). Mimus will no longer be able to read new data. To remove the data already imported, click Disconnect in Mimus or delete your account.

## 4. How and why we use information

We use your information only for the purposes below. The legal basis applies where laws like the GDPR or UK GDPR require one.

- **To provide the Service.** This covers creating your account, running your workspace, importing connected data, search, AI answers and invitations. Legal basis: performance of our contract with you or your organization.
- **To answer your questions with AI.** Legal basis: performance of contract.
  1. Your question goes to OpenAI.
  2. OpenAI may ask Mimus to search your data.
  3. Mimus runs that search using **your own permissions**, so the AI can only see data you can see.
  4. Mimus sends OpenAI the matching excerpts.
  5. OpenAI writes the answer and Mimus shows it to you with links to its sources.
- **To keep the Service secure and working.** This covers preventing abuse, investigating problems, enforcing AI spending limits and recording the AI usage log. Legal basis: our legitimate interest in running a secure service.
- **To bill your organization.** Legal basis: performance of contract and our legal obligations.
- **To send service emails,** such as sign-in links and invitations. Legal basis: performance of contract. We do not send marketing email. [TODO: update if marketing email is ever added]

We do not use your information for advertising and we do not sell it.

## 5. Who we share information with

We use these service providers ("processors"). Each receives only what it needs to provide its service to us, under contract:

- **Supabase** stores our database and runs sign-in. It holds all the information described in this policy. [TODO: region]
- **OpenAI** generates AI answers. It receives your question and the excerpts described in section 3.
  - We send requests with storage turned off (`store: false`), and OpenAI does not use API data to train its models.
  - [TODO: confirm whether Zero Data Retention is enabled. If not, keep this sentence: "OpenAI may retain API inputs and outputs for up to 30 days to monitor for abuse, then deletes them."]
- **Resend** delivers sign-in and invitation emails. It receives the recipient's email address and the email contents.
- **Stripe** processes subscription payments. It receives your organization's billing details. Card details go directly to Stripe.
- **[TODO: hosting provider, e.g. Vercel]** hosts the web app. It processes requests and technical logs. [TODO: region]

**Services you connect** (Google, Microsoft, Slack and Calendly) are not our processors. We only read data from them with your permission, and we never send them your data from other services.

**Other disclosures:**

- **Legal requirements:** we may disclose information if required by law, or to protect the rights, safety or security of our users or others. Where the law allows, we will tell you first.
- **Business transfer:** if Mimus is acquired or merged, information may transfer to the new owner under the same commitments in this policy. This includes the Google user data commitments in section 3. We will notify you before that happens.

## 6. How long we keep information

- **Connected-service data** (messages, events, contacts, tokens): kept while the service stays connected. Deleted immediately when you disconnect it or delete your account.
- **Account, profile and workspace data:** kept until you delete your account (section 9). If you're the only member of a workspace, deleting your account also deletes that workspace and everything in it.
- **AI usage log:** kept for your workspace's records while the workspace exists. When you delete your account, your entries are kept but are no longer linked to you.
- **Invitations:** kept while the workspace exists, so its Owners can see who was invited and when.
- **Billing records:** kept as long as tax and accounting law requires. [TODO: confirm period]
- **Backups:** deleted data may remain in our database provider's encrypted backups until they expire. [TODO: confirm backup retention period for the production plan]

[TODO: if a time-based limit on imported data is adopted, e.g. "messages older than N days are deleted", state it here.]

If a workspace Owner removes you from a workspace, the services you connected there stay connected until you delete your account. [TODO: remove this sentence once removal also disconnects the member's services]

## 7. Security

- Data is encrypted in transit (TLS) and at rest by our database provider.
- Access tokens for connected services are additionally encrypted by Mimus with AES-256-GCM before storage.
- Who can see what is enforced by row-level security rules inside the database itself, not only by app code. A workspace member's private data can't be returned to anyone else, even by our AI.
- [TODO: describe staff access controls, and the Google-required security assessment (CASA) once completed]

No system is perfectly secure. If we learn of a breach affecting your information, we will notify you and the relevant authorities as the law requires.

## 8. Your rights and choices

Depending on where you live, you have rights over your personal information:

- access and receive a copy of it
- correct it
- delete it
- restrict or object to how we use it
- data portability
- withdraw consent at any time
- complain to a data protection authority

**Choices available in the app now:**

- **Disconnect** any connected service on the Connections page. This removes its imported data immediately.
- **Make a connected account Private** at any time on the Connections page. The visibility rules are in section 3.
- **Revoke Google access** at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Delete your account** (section 9).

**To make any other request,** email [TODO: privacy email]. We will respond within 30 days (one month under the GDPR). We may need to verify your identity first.

If you're in the EU or UK, you can complain to your local data protection authority. [TODO: add EU/UK representative details if required (GDPR Art. 27 / UK GDPR Art. 27)]

### California residents (CCPA/CPRA)

- In the last 12 months we have collected these categories of personal information for the purposes in section 4:
  - identifiers (name, email)
  - the contents of email and messages you connect
  - commercial information (subscription)
  - internet activity (service logs)
- **We do not sell or share personal information** for cross-context behavioral advertising.
- We do not use sensitive personal information to infer characteristics about you.
- You have the right to know, delete and correct your information, and to not be discriminated against for exercising these rights.

## 9. Deleting your account

**In the app:** go to **Settings → Account** and choose **Delete account**. When you confirm:

1. Every service you connected is disconnected, and Mimus's access to it is revoked.
2. All data imported from those services is deleted: messages, events, contacts and tokens.
3. Your profile and workspace memberships are deleted.
4. Any workspace where you're the only member is deleted with all its content.
5. Your sign-in account is deleted.

**Some things block deletion until you sort them out:**

- If you're the only Owner of a workspace that has other members, remove them first, or contact us to transfer ownership. This keeps the team from being left without an Owner.
- If a workspace you'd delete has an active paid subscription, cancel it first.

**Without signing in:** see [Deleting your Mimus account](/account-deletion), or email [TODO: privacy email] from your account's email address and we will delete it within 30 days.

## 10. International transfers

We are based in Pakistan, and our service providers process data in [TODO: regions, e.g. the United States and the EU], so your information may be processed outside your country. Where the GDPR or UK GDPR applies, we rely on adequacy decisions or the European Commission's Standard Contractual Clauses (and the UK Addendum) with our providers. [TODO: confirm with each provider's Data Processing Agreement]

[TODO: verify Pakistan's current data protection law status. The Personal Data Protection Bill had not been enacted as of drafting; update this section if it has been.]

## 11. Children

Mimus is a business tool for people aged [TODO: minimum age, recommended 18] and over. It is not directed at children, and we do not knowingly collect personal information from children under 13 (or under 16 in the EU/UK). If you believe a child has given us personal information, contact [TODO: privacy email] and we will delete it.

## 12. Changes to this policy

If we make material changes, we will update the effective date above and notify account holders by email or in the app before the changes take effect. If we ever want to use Google user data in a new way, we will update this policy and ask for your consent first.

## 13. Contact

Questions or requests about this policy: [TODO: privacy email], [TODO: legal entity name], [TODO: address].
