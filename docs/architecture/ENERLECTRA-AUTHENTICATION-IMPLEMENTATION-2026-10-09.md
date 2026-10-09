# Enerlectra Authentication Implementation Notes

Date: 2026-10-09
Status: implementation baseline and configuration gate; no production auth settings changed.

## Decision

Use Supabase Auth as the authentication authority for the web application. Google OAuth is the preferred low-friction sign-in option, with email/password retained as a fallback. Phone OTP is a later rollout step after delivery provider, cost, rate limits, recovery, and abuse controls are decided.

Authentication proves an identity. It does not grant organization ownership or access by itself.

## Repository observations

- The current V1 client already has a `GoogleSignIn` component calling `supabase.auth.signInWithOAuth({ provider: 'google' })`.
- The existing sign-in and sign-up screens render this component.
- The V1 client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never put a service-role key in browser code.
- The V2 foundation migration models `actors.auth_user_id` as a unique reference to `auth.users(id)`, and separates actors, organizations, memberships, roles, permissions, and channel identities.
- The V2 organization-creation function requires an active actor and assigns ownership only through the explicit organization-creation workflow. Authentication alone must not create an organization or membership.

## Required sign-in flow

1. Supabase Auth completes Google OAuth and returns to an allow-listed URL.
2. The client reads the authenticated session from Supabase Auth.
3. Server-side identity provisioning resolves or creates exactly one actor for the authenticated `auth.users.id`, idempotently.
4. Organization membership is loaded separately. If there is no active membership, show an onboarding/join/create-organization choice; do not invent a default organization.
5. Every protected API/database operation enforces the authenticated actor, active membership, permission, and tenant scope server-side/RLS-side.
6. A verified phone number or WhatsApp channel identity may be linked only through a proof-of-control flow. Matching a phone string or email alone must not merge identities or memberships.

## OAuth configuration checklist

Configure in the intended Supabase project's Auth > Providers > Google:
- Enable Google provider.
- Set the Google OAuth client ID and client secret from Google Cloud Console.
- Register the exact Supabase callback URL in Google Cloud Console.
- Add only the required local, preview, and production application URLs to Supabase Auth's redirect allow list.
- Confirm the production domain and preview domains are not using wildcard redirects.
- Test cancellation, provider denial, callback failure, expired session, and successful login.
- Confirm email confirmation and password reset settings for email/password sign-up.

These are dashboard/provider settings and require the project owner to supply/manage Google OAuth credentials. No credentials are stored in this repository and no provider settings were changed by this commit.

## Required acceptance tests

- Google login success creates or resolves one actor, not duplicates.
- OAuth cancellation returns to sign-in with a useful message.
- Repeated login is idempotent.
- A new authenticated user with no membership cannot read tenant data or call organization operations until onboarding authorizes the operation.
- A user in organization A cannot read or mutate organization B data, including via guessed IDs.
- An employee joining an existing organization is not silently made OWNER.
- OAuth email metadata cannot assign roles, permissions, or tenant membership.
- Account linking requires proof of control for both identities and cannot be triggered solely by equal email/phone strings.
- Session refresh, logout, and revoked membership are respected by server-side authorization.
- No service-role secret is exposed to the client bundle.

## Explicitly out of scope for this change

- No production Supabase schema/data changes.
- No production Render deployment or PR merge.
- No enabling Google provider without the correct Google OAuth credentials and exact redirect URLs.
- No phone OTP/WhatsApp authentication until delivery and anti-abuse controls are configured.
- No change to the legacy V1 database URL or client environment.

## Release gate

Google sign-in is not considered production-ready merely because the button exists or the OAuth request compiles. Provider configuration, callback allow-list, actor provisioning, no-membership onboarding, and cross-tenant authorization tests must all pass before enabling it for production users.
