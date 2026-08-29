# Argon Dashboard — Unity Project Management

A multi-user project dashboard for your Unity game studio: projects, team roster with
roles, daily work logs with hours, review/approval, and reports. Built on Supabase
(auth + database) — same project you already use.

## What's inside

```
argon-dashboard/
├── index.html            Login page (sign in, first-time admin setup, password flows)
├── app.html              The dashboard (all sections, role-aware)
├── supabase-setup.sql    Run once in Supabase SQL Editor
├── css/styles.css        Design system + dashboard styles
├── assets/logo.png       Argon logo
└── js/
    ├── config.js         ← your Supabase URL + anon key
    ├── icons.js          Icon set
    ├── util.js           Dates, off-day rules, validators
    ├── ui.js             Toasts, modals, custom date picker, theme
    ├── api.js            Supabase data layer
    ├── auth-page.js      Login page logic
    ├── app.js            App shell, navigation, session guard
    └── views/            overview / projects / team / worklog / review / reports
```

## Setup (one time, ~5 minutes)

1. **Run the SQL** — Supabase Dashboard → SQL Editor → paste the whole
   `supabase-setup.sql` → Run. It adds the new columns (roles, login link, project
   status, leads), creates the `work_logs` table, and locks everything down with
   Row Level Security. Safe to run on top of your existing data.

2. **Auth settings** — Supabase Dashboard → Authentication → Sign In / Providers:
   - **Email** provider: enabled.
   - **Confirm email: OFF.** (Required — the admin creates accounts directly with
     temporary passwords, so there's no confirmation-mail step.)

3. **Config** — `js/config.js` already has your project URL + anon key. Change it
   here if you ever move projects.

4. **Host the folder** — any static hosting works (Netlify, Vercel, GitHub Pages,
   or your own server). Opening `index.html` directly from disk also works in most
   browsers, but hosting is recommended so logins persist cleanly.

5. **Create the admin** — open `index.html`. Since no admin exists yet, a
   **First-time setup** panel appears: enter your name, email, and password.
   That's your admin account (this panel disappears forever afterward).

## Daily use

- **Admin** adds team members in **Team → Add Developer**: name, role, login email
  + a temporary password (share it with them however you like). On their first
  sign-in they're forced to set their own password.
- **Developers** log what they did in **My Daily Work** — per project (assigned or
  any other project, or "Other work" like R&D/meetings) with hours and a description.
  Entries can be edited/deleted while **pending**; once approved they lock.
- **Leaders/Admins** use **Review** to see each day's updates per developer, red
  **No update** flags (off days excluded — Sundays and 1st/3rd Saturdays), and
  approve entries. **Reports** gives hours by developer or project with CSV export.
- Roles: **Admin** = everything. **Team Leader** = developer + edit projects they
  lead + review/approve. **Developer** = own work log + view projects/team.

Security is enforced in the database (RLS), not just the UI — a developer's
account physically cannot edit other people's logs or projects.

## Notes & limits

- **Password resets**: "Send reset email" works only if email sending is configured
  in Supabase (Authentication → Emails). Without it, set a new password manually in
  Supabase Dashboard → Authentication → Users.
- **Deleting a developer** removes their work logs (kept if you mark them
  **inactive** instead — recommended). Their auth account must be deleted manually
  in Supabase → Authentication → Users.
- The old single-file catalog (`argon-unity-project.html`) still works but writes to
  the same tables without login — retire it once the dashboard is live, and consider
  rotating the anon key if it was shared.
