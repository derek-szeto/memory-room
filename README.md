# Memory Room

A shared document workspace with large inline text, text sections, checklists, attachments, document navigation, search, and light/dark/system themes. Existing plain-text notes appear as text sections. Each section autosaves after a pause; saved changes synchronize every two seconds. Concurrent edits use version checks. Unsaved drafts remain on the same device, scoped to the signed-in user and workspace.

This is section-level collaboration: simultaneous keystrokes and cursors are not merged. A stale save keeps your draft and lets you use the latest saved version or create a copy.

Open **Settings** from the sidebar or the gear in the top bar. Appearance settings include light/dark/system themes, three document text sizes, sans serif/serif fonts, focused/wide pages, outline visibility, and reduced motion. Preferences persist in this browser. The Account tab shows your identity and lets you sign out on this device while keeping account-scoped drafts. The Workspace tab includes renaming, sharing, and a plain-text download of the latest saved sections (attachment names are included; file contents are not embedded).

## Your connected project

Memory Room is provisioned in Derek Szeto's Org, region `us-east-2` (Ohio). Supabase quoted $0/month for project creation. Dashboard: https://supabase.com/dashboard/project/cmedwkorafhfjaauisgr

The database migrations below are already applied to this project. Do not run the initial creation migration again. The local `.dev.vars` contains the project URL and publishable key and is ignored by Git. The app now opens the Supabase sign-in screen.

One dashboard step remains: in **Authentication → URL Configuration**, set **Site URL** to `http://127.0.0.1:5173` and add that URL to the redirect allowlist. The plugin does not expose this configuration. Use the exact URL printed by the local server; update these settings when deploying. Then create your account in the app, confirm your email, and sign in.

Verified against the live project: the SQL access tests passed, security advisors initially returned no issues, the file bucket is private with a 10 MB limit, Email/password signup is enabled with confirmation required, and signed-out REST workspace requests return 401. Test fixtures were rolled back. The performance advisor's only remaining informational finding is that the newly added owner index has not been used yet: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

Local migration filenames match the remote migration history. Generated database types are in `db/supabase-types.ts`.

## Run locally

Requires Node 22.13+ (Node 24 recommended).

```powershell
npx --yes pnpm@10.34.4 install --frozen-lockfile
npm run dev
```

Open the URL printed by the dev server. Supabase is the only backend: the legacy D1 binding is disabled in `.openai/hosting.json` (set `"d1": "DB"` and run `npm run build && npm run db:local` to bring the old local fallback back).

## Deploy

The app is a Cloudflare Worker and deploys to a free `https://memory-room.<your-subdomain>.workers.dev` URL.

```powershell
npx wrangler login                                  # once, opens the browser
npm run deploy                                      # build + wrangler deploy
npx wrangler secret put SUPABASE_URL --name memory-room              # once; persists across deploys
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY --name memory-room  # once; publishable key only
```

The first `npm run deploy` creates the Worker. Set both secrets after it, then open the URL it prints. Then, in Supabase **Authentication → URL Configuration**, set **Site URL** to that HTTPS URL and keep `http://127.0.0.1:5173` in the redirect allowlist for local work. Confirmation emails link to the Site URL.

## Connect Supabase

The complete PostgreSQL migration is in `supabase/migrations/20261012033515_memory_room_workspace.sql`; it includes tables, indexes, foreign keys, member-only row-level security, atomic create/join/write functions, version checks, and a private file bucket.

1. Open your Supabase project. In **SQL Editor**, paste and run the migration once. For a project managed with Supabase CLI, use `supabase link --project-ref YOUR_PROJECT_REF` and `supabase db push` instead. Keep applied migrations unchanged; append new ones for future changes.
2. In **Authentication → Providers**, enable Email/password. Keep email confirmation enabled. Set **Authentication → URL Configuration → Site URL** to your app URL, initially `http://localhost:5173`. Update it for your deployed URL. The app supports account creation, email confirmation, and password sign-in.
3. Copy the project URL and **publishable** key from the project's Connect/API settings. The legacy `anon` key also works. Never use a secret or `service_role` key: `/api/config` returns these public settings to the browser.
4. Create an ignored `.dev.vars` in the project root for this Cloudflare/Vinext app:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

5. Restart `npm run dev`. You should see the Supabase sign-in screen. Create an account, confirm its email, and sign in. Create a workspace, insert a checklist, then insert a files section and upload a file.
6. In another browser/private window, use a different account. Share the website URL and the workspace owner's invite code. Join with the code and verify edits synchronize. Each member can edit and delete every section. Only the owner sees the invitation code; invitations currently have no expiry or revocation.

For hosting, set the same two variables as Worker secrets (see **Deploy**). This app needs a server; do not host it as static files. No service key or PostgreSQL password is needed at runtime. Supabase Auth validates the user's JWT and the SQL functions check membership server-side; local test headers do not grant Supabase access.

## Storage

The migration creates the private `workspace-files` bucket. Allowed types are JPG, PNG, WebP, PDF, and plain text, maximum 10 MB. Paths are `room-id/random-id/filename`. Membership policies check the first path segment. Files open through 60-second signed URLs rather than public links.

Removing an attachment from a section removes its reference; the object remains in Storage. Uploads whose draft never saves can also remain. Review orphaned objects in the Storage dashboard before deleting them. The uploader can delete their own objects through the Storage API while still a room member. Reuse of signed links is possible until they expire.

## SQL you can explore

- `workspace_rooms`: shared documents, owner, private invitation token.
- `workspace_members`: room membership and recent activity.
- `workspace_sections`: ordered sections, JSON content stored in `body`, author/editor, timestamps, version.
- `private.workspace_is_member(text)`: indexed membership helper used by RLS and Storage policies.
- `workspace_rooms()`: lists your workspaces and reveals invite codes only to their owner.
- `workspace_action(jsonb)`: validates writes and rejects outdated edits/deletes with HTTP 409 / SQLSTATE `PT409`.

Clients have read grants and RLS policies, but no direct table-write grants. All mutations use the validated RPC. Privileged implementations live in the non-exposed `private` schema, pin their search path, and are executable only by authenticated users. Public RPC entrypoints use security invoker. PostgreSQL milliseconds match the original API's timestamps. Sections are ordered by their creation time.

## Checks

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

The automated tests verify the original D1 collaboration writes and section draft compatibility. Supabase policy tests are in `supabase/tests/access.sql`; run them in SQL Editor after the migration. They run inside a rolled-back transaction with fixture identities. Also complete the two-account browser check above before inviting people. Local build checks alone do not prove live Auth, Storage, or PostgreSQL access.

## Backend and source

`lib/workspace-client.ts` implements Supabase Auth session refresh, the PostgreSQL REST/RPC calls, and Storage uploads/signed URLs using fetch. It uses your publishable key and signed-in user's JWT. `app/api/config/route.ts` serves only the public connection settings. `lib/document.ts` defines sections and reads legacy notes. `app/page.tsx` provides the inline editor and per-user device draft recovery.

The existing D1 schema and tests remain in `db/`, `drizzle/`, `lib/collaboration.ts`, and `tests/`. Their API lives in `app/api/collab/route.ts`. Supabase uses its own PostgreSQL migration directory; do not apply the SQLite `drizzle/` files to Supabase.

Docs: https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/storage/security/access-control

## Profiles, media, and live collaboration

Settings includes custom accent colors, light/dark backgrounds, a saved display name, a profile photo, and a cursor color. Colors stay in the browser. Profile names/photos/cursor colors are shared with people who share a workspace. Profile photos use the private profile-images bucket (JPG, PNG, or WebP, up to 2 MB); contributors cannot replace someone else's photo. Old uploads remain until explicitly removed in Storage.

Workspace Settings saves a shared description, image icon, and Document/Webpage layout with version checks. The create dialog also offers both types. Webpage means a visual layout inside the collaborative workspace; it does not publish a separate public website. Any member can edit workspace metadata. Workspace images have a 10 MB limit.

Insert Image for an image with a caption, or Text & image for a two-column visual element. Files use expiring signed URLs. Downloaded text exports include captions and text; image bytes are not embedded.

The Contributors list shows workspace members. Online now uses Supabase Realtime Presence and shows users with a visible connected tab. Members receive colored pointer indicators, text caret positions, and section location badges. Jump scrolls to the selected person's section, even if search previously hid it. Each tab has its own presence key; the list combines tabs belonging to the same contributor. Presence and cursor positions are ephemeral.

Private workspace channels use member-only select/insert policies on realtime.messages. The app joins with private: true and sends the signed-in user's JWT through the official Supabase client. Pointer updates are throttled. Presence refreshes every five seconds; reconnecting connections clear stale online lists. Saved changes still synchronize every two seconds. Simultaneous typing is protected by version conflicts instead of merged. Remote carets are rendered against the viewer's current text, so positions can differ while unsaved text differs. Browser layout/caret visuals still need a two-browser manual check.

The live integration check used two temporary authenticated clients to verify private channel denial to outsiders, private photos, image storage, workspace conflicts, member snapshots, online presence, and cursor/caret broadcast delivery. Temporary files and accounts were removed. TypeScript, the production build, SQL access tests, and 16 automated tests passed.

Supabase's current advisor flags disabled leaked-password protection. This Auth setting is not exposed by the plugin; details: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
## Moving sections and confirming deletion

Drag a section's Move handle to place it above or below another section. A line marks the insertion point. Up/Down buttons provide keyboard and touch controls. These controls work in both Document and Webpage layouts; Webpage uses the shared order to fill its grid. Clear document search before reordering.

Section order is saved separately from section content. A room row lock and order_version prevent two moves from silently overwriting each other. Adding/deleting sections updates the order and its version. Moves preserve each section's ID and content version, so existing drafts and cursor locations stay associated with the same section. SQL access tests cover shared ordering, stale moves, duplicate orders, deletion cleanup, and membership enforcement.

Deleting opens a native accessible dialog styled with the user's current theme and colors. It animates open and closed, defaults focus to Keep Section, supports Escape/backdrop dismissal, and respects system/browser reduced-motion settings. Deletion failures appear inside the popup. Autosave and background list refreshes pause during the confirmation to keep the popup stable; cancellation resumes editing. Browser confirm/alert boxes are not used.

## Formatting, design sections, and the collapsible sidebar

Hide the sidebar with the panel button beside the logo (or Ctrl+\); show it again from the top bar. The choice is remembered in this browser. On phones the sidebar stays a slide-out drawer.

Text, image captions, Text & image, quotes, callouts, captions, card descriptions, and timeline details are rich text. Focus one to show its toolbar: bold, italic, underline, strikethrough, text color, highlight, and clear formatting (Ctrl+B/I/U also work). Pasting inserts plain text. Formatted text is stored as HTML in the section's `html` field, with plain text kept in `text` for search, export, and older sections. Every HTML value is sanitized (`lib/rich-text.ts`) before it is shown or saved: only formatting tags, colors, highlights, and alignment survive.

Insert section is grouped into Write (Text, Header, Caption, Quote, Callout, Checklist), Media (Image, Text & image, Gallery, Files), and Layout & design (Cards, Timeline, Divider, Spacer). Hover a section to show its options: alignment and size, cards or images per row (1–4), timeline layout, divider style, spacer height, or callout color. Cards open a popup where anyone can edit the title, subtitle, color, image, and full description. All images in the document have rounded corners.

Remote text carets are shown for plain inputs (titles, headers, list items, timeline dates/titles) but not inside rich-text fields. Pointer cursors and "is here" badges work everywhere. A section's JSON is still limited to 20,000 characters, so very long formatted text or many cards can hit that limit; the save error says so.
