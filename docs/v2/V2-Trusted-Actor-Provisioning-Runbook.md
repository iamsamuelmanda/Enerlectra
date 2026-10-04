# V2 Trusted Actor Provisioning Runbook

## Purpose

The V2 database deliberately does not permit authenticated users to create their own Actor, attach an external channel identity, or create an Organization through the browser RPC. Until a complete invitation/onboarding UI exists, provisioning is an explicit trusted-operator action.

The CLI below uses the V2 service-role key locally. It is not an HTTP endpoint and must never be exposed to the browser.

## Required environment

Set these in a trusted local shell or a secrets manager:

- `V2_SUPABASE_URL`
- `V2_SUPABASE_SERVICE_ROLE_KEY`

Do not commit either value. Do not paste the service-role key into source code, chat, browser environment variables, or CI logs.

## Create an organization and invite its first owner

```bash
npm run provision:v2:actor -- --email owner@example.com --organization "Solar Operator Ltd"
```

This creates an ACTIVE organization, sends a Supabase Auth invitation, creates the canonical HUMAN Actor, and creates an ACTIVE OWNER membership. The script prints the generated IDs only after all database steps succeed.

## Invite a member into an existing organization

```bash
npm run provision:v2:actor -- --email operator@example.com --organization-id ORGANIZATION_UUID --role OPERATOR
```

Supported roles: OWNER, OPERATOR, TECHNICIAN, FINANCE, VIEWER.

For an existing organization, the operator must supply the role explicitly. The CLI checks that the target organization is ACTIVE.

## Failure behavior

The script attempts compensating cleanup if a step fails: it deletes any Actor and Auth user it created, and deletes a newly created organization. Because Supabase Auth and Postgres are separate services, this is compensating cleanup, not a distributed transaction. Verify the project after any interrupted run.

## Current product limitation

This is an operator-run bootstrap path, not self-service onboarding. The authenticated browser sign-in, invitation acceptance experience, organization switcher, and operational workspace are still not implemented. WhatsApp channel identity provisioning remains separate and must wait for provider ownership verification; do not infer a WhatsApp identity from a phone number alone.
