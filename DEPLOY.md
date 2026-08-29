# Deploying 2e Pathway

This app holds student records. Work through the checklist in order — the
Supabase half has to be right before the Vercel half means anything.

There is no Node on the machine this was set up from, so the route below is
**GitHub → Vercel import**, which needs no local toolchain. If you do install
Node 22 later, `npx vercel` works too.

---

## Part 1 · Supabase

### 1.1 Create the project
Supabase dashboard → **New project**. Pick a region near your staff. Save the
database password somewhere real; you will not be shown it again.

### 1.2 Run the SQL
SQL Editor → **New query**. Run these in order, one at a time:

1. `01-schema.sql` — the four tables (`cases`, `case_steps`, `case_notes`,
   `stage_transitions`), the `2E-0001` reference sequence, and the indexes.
2. `02-security.sql` — row-level security.

Both are safe to re-run. If the app ever shows *"Could not load cases …
permission denied"*, re-running `02-security.sql` is the fix, which is exactly
what the in-app error banner tells the user.

**Read `02-security.sql` before you run it.** The `ALLOWED_DOMAINS` check in
`page.tsx` runs in the browser. The anon key is public by design, so that check
stops an honest mistake and nothing more. The domain gate in `02-security.sql`
runs inside Postgres and is the one that actually keeps non-GT accounts out of
student records. Same story for the case file's promise that a dated note
"cannot be edited or deleted" — that is true because `case_notes` has select and
insert policies and deliberately has no update or delete policy.

### 1.3 Verify RLS is actually on
Table Editor → each of the four tables should show the green **RLS enabled**
badge. Or run:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('cases','case_steps','case_notes','stage_transitions');
```

All four must be `true`. If any is `false`, that table is world-readable to
anyone who has the anon key out of the JS bundle. Stop and fix it before
deploying.

### 1.4 Copy the two keys
Project Settings → **API** (newer dashboards split this into **Data API** for
the URL and **API Keys** for the key; the **Connect** button at the top of the
project also shows both, pre-formatted):

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **publishable** (`sb_publishable_…`) or legacy **anon / public** (`eyJ…`)
  → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

⚠️ **Take the Project URL, not the RESTful endpoint.** The Data API page shows
`https://YOUR-REF.supabase.co/rest/v1/` right beside it, and grabbing that one
instead is the easy mistake. `supabase-js` then builds
`…/rest/v1/auth/v1/otp`, and sign-in fails with *"Invalid path specified in
request URL"* — an error that reads like a redirect or email problem and is
neither. The value you want ends at `.supabase.co`, with nothing after it.

`app/page.tsx` now takes the origin of whatever you supply, so a stray path is
tolerated. Set it correctly anyway; the next person reading the variable should
not have to know about the workaround.

Never put the `service_role` or `sb_secret_…` key in a `NEXT_PUBLIC_` variable.
It bypasses RLS.

### 1.5 Auth — Site URL and redirects
Authentication → **URL Configuration**. Sign-in calls
`emailRedirectTo: window.location.origin`, so every origin the app is served
from has to be allowlisted or the magic link will bounce.

- **Site URL:** `https://your-production-domain.com` (no trailing slash, no path)
- **Redirect URLs:** add each of these on its own line:
  - `https://your-production-domain.com` ← **the bare origin, no wildcard**
  - `https://your-production-domain.com/**`
  - `http://localhost:3000` and `http://localhost:3000/**` (local dev)
  - `https://*-YOUR-TEAM.vercel.app/**` (Vercel preview deploys — skip this if
    you turn previews off in 3.4)

**Add the bare origin as well as the `/**` pattern.** These entries are matched
as globs, and `https://host/**` expects a path, so it does not match a bare
`https://host`. Miss it and sign-in fails with *"Invalid path specified in
request URL"* before any email is sent — which reads like an email problem and
is not one. `SignIn` now sends `origin + '/'` for this reason, but keep both
entries: the trailing slash is easy to lose in a future edit.

### 1.6 Auth — email delivery ⚠️ the usual blocker
Authentication → **Emails**.

Supabase's built-in email sender is rate limited to a handful of messages per
hour and is intended for development. With a team of advisors signing in, staff
will silently stop receiving links. Configure **custom SMTP** (Google Workspace,
Postmark, Resend, SES) before you hand this to anyone.

While you are here: the sign-in screen tells the user the link "works once and
expires in an hour." That matches Supabase's 3600s default — if you change the
expiry, change that copy in `SignIn` in `app/page.tsx` too.

### 1.7 Auth — who may sign up
`signInWithOtp` creates a user for any address it is given by default. That is
survivable, because a non-GT account gets an empty caseboard and is refused by
every RLS policy. If you want the front door shut as well, Authentication →
**Sign In / Providers** → disable new sign-ups, and invite staff from the Users
tab instead.

---

## Part 2 · Get the code into GitHub

This folder is not a git repository yet. `.gitignore` is already correct — it
excludes `node_modules`, `.next`, and `.env.local`, while keeping
`.env.local.example`.

```powershell
git init
git add .
git commit -m "GT Anywhere 2e Pathway"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/gt-2e-pathway.git
git push -u origin main
```

Before pushing, confirm no real key went in: `git grep -i "supabase.co"` should
only hit `.env.local.example` and this file.

Make the repo **private**.

---

## Part 3 · Vercel

### 3.1 Import
vercel.com → **Add New → Project** → import the repo. Vercel detects Next.js
14; leave the build and output settings alone. `package.json` pins
`"engines": { "node": "22.x" }`, so Vercel will use Node 22.

### 3.2 Environment variables — before the first build
Set both, for **Production, Preview, and Development**:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from 1.4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from 1.4 |

`NEXT_PUBLIC_` variables are **inlined at build time**, not read at runtime. If
you add them after a deploy has already gone out, that deploy will not pick them
up — you have to redeploy. A build with either one missing now fails with a
readable message pointing back at this file rather than
`supabaseUrl is required`.

### 3.3 Deploy, then close the loop on the domain
Deploy. Then take the real production URL and go back to **1.5** — Site URL and
Redirect URLs have to name the domain you actually landed on, including a custom
domain if you add one later. Magic-link sign-in is broken until they match.

### 3.4 Protect previews
Settings → **Deployment Protection**. Preview deploys point at the same
production Supabase project and therefore the same real student records. Leave
Vercel Authentication on for previews, or turn preview deployments off.

---

## Part 4 · Smoke test the deployed app

1. Open the production URL. You should get the **Sign in** screen.
2. Enter a non-GT address, e.g. `someone@gmail.com` → refused in the browser
   with *"Use your GT address."*
3. Enter your `@gt.school` address → *"Check your email."* Click the link.
4. You land on the caseboard: six stage tiles, all counts zero, and
   *"No cases yet."* If instead you see the red **"Could not load cases"**
   banner, `02-security.sql` did not take — re-run it.
5. **New Concern** → file a test case. Required fields the form enforces: at
   least one domain in Step 02, and a strength of at least 12 characters.
6. Save. You should be returned to the caseboard with the case showing a
   `2E-0001` reference. Open it and confirm the generated next steps, the gate
   flags, and the evidence gaps all render.
7. Add a dated note, then move a stage. Confirm both land in **History**.
8. Confirm **06 Fit Review** is disabled on a case where nothing has been tried
   — that gate is the point of the tool.
9. Delete the test case from the Supabase Table Editor when you are done. The
   app cannot delete it, on purpose.

---

## Part 5 · The `npm audit` warning

`npm ci` reports **2 high severity vulnerabilities** — 21 advisories against
`next` and 4 against `postcss`. Do not run `npm audit fix --force`. It installs
Next 16, a two-major-version jump pulling in React 19, and it will not be a
quiet upgrade.

Almost none of those advisories reach this app, because it uses almost no
Next.js surface area. Verified against the tree: no `next/image`, no
`next/script`, no middleware, no Server Actions (`use server`), no API routes,
no `pages/`, no rewrites, no redirects, no custom headers, no i18n, and
`next.config.js` sets only `reactStrictMode`. `app/` is three files, and
`next build` reports both routes as `○ (Static)` — fully prerendered. That
retires the image-optimizer, middleware-bypass, rewrite-SSRF, Server-Action,
and RSC-cache-poisoning advisories, which is the bulk of the list. The `postcss`
ones need attacker-controlled CSS; the only stylesheet is `app/globals.css`.

So this is not urgent. But Next `14.2.35` is well behind, and "no exploitable
surface" holds only while that stays true — the first middleware file or
`next/image` tag someone adds changes the answer. Plan the upgrade to a current
Next as its own piece of work, with the Part 4 smoke test as the check.

## Known gaps, so nobody is surprised

- **No delete or edit path in the product.** Correcting a typo in a filed case
  means a note, or a Supabase Table Editor change by an admin.
- **`buildPlan` runs twice.** Steps are generated and stored at intake, but the
  case file re-derives the plan on every open for the flags, gaps, and fit
  track. Edit a case's data directly in Supabase and the stored steps and the
  live flags can disagree.
- **Owner fields are free text**, not linked accounts. "Assigned AA" is a name
  someone typed, so it cannot drive notifications or per-advisor filtering yet.
- **No audit of reads.** The tables record who wrote, via `created_by`, but
  nothing records who looked.
