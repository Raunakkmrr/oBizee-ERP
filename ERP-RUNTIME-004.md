# ERP-RUNTIME-004 web candidate

Base `839a534e2dd172389ab12304409091a109d4b28a`, Next16.2.12; no dirty A–Z UI/routes copied.
Includes the accepted dashboard-aligned sign-in, original mark embedded losslessly in an
SVG asset (no optimizer/network dependency), bounded password/session client, and only
the session-error type dependency. The unshipped field/offline stores are not imported;
sign-out clears authentication without reading/deleting local drafts or claiming they
are encrypted. Base tracked font behavior remains unchanged.

The old3537 preview had NEXT_PUBLIC_API_URL baked to3538, a rejection fixture. It was
visual evidence only, not proof of real credentials. This candidate has no such target:
browser calls are relative; production data source is API-only. Unavailable routes/data
remain unavailable, never substituted with sample company data. Later business screens
and password-change support are not released by this authentication checkpoint.
Successful login now navigates to `/account`, a real-identity-only page with no business
shell, fixture role, ratings, counters or business navigation. `src/proxy.ts` redirects
all inherited business routes (including direct `/today` and root visits) to that
checkpoint before rendering. The API remains the identity/authentication authority;
this server boundary restricts the released UI, not a replacement for API authorization.
The hosting canary must prove this Next16 Proxy executes: root, `/today`, `/jobs` and
other inherited page URLs must return307 to `/account` before release. An adapter that
ignores Proxy is a release blocker, even if its build succeeds.

Server-only configuration (must be exact, never NEXT_PUBLIC):

- ERP_TENANT_API_URL: actual newly deployed HTTPS execute-api endpoint in ap-south-1,
  origin only, no path/port/credentials/query. No production URL exists yet; none is guessed.
- ERP_WEB_ORIGIN: actual generated main Amplify HTTPS origin, no trailing slash.

No DB/JWT/platform/admin secrets belong in this app. Missing/invalid target returns503
with a clear unavailable message. The proxy allows only password/refresh/sign-out,
identity and health paths; checks exact POST Origin, JSON/body limit and cross-site
metadata; forwards only needed auth headers and only obizee_refresh under /auth; refuses
redirects, domain-scoped/insecure cookies and successful auth without a refresh cookie;
uses no-store and bounded upstream requests. No synthetic backend is served for tests:
unit tests mock modules/fetch in-process and never send a real password.

Hosting proposal (unexecuted): create a distinct Amplify WEB_COMPUTE app from this repo's
reviewed main commit; do not reuse admin/marketing/star/order app. Its generated HTTPS
main URL is sufficient without custom DNS. Use an app-scoped SSR service role, no DB or
platform access. Run all tests/types and build from frozen lockfile in amplify.yml before
publishing; persist only the two server configuration keys, following the proven admin
SSR env allowlist pattern (without its unlocked installs). GitHub check actions are
immutable SHA pins; production build is API-only. Do not enable branch previews to share
production auth configuration or cookie realm.

AWS currently documents native Next12–15 support. Do not downgrade Next or assert16.2.12
compatibility silently: create a credential-free hosting canary, record actual app URL,
prove route handler+cookie+SSR configuration behavior, then review before real auth.
If native adapter rejects16, stop for an explicit custom adapter/hosting decision.
Initial canary has no API config and must show unavailable; it is never connected to a
synthetic backend. Only after approved tenant API CI release set the exact real target.

Optional GitHub-triggered hosting releases require a separate role, not the backend
Lambda role. Verified immutable repo identifiers give this exact main subject:
repo:Raunakkmrr@48851091/oBizee-ERP@1327470247:ref:refs/heads/main
audience sts.amazonaws.com. Pin amplify:StartJob/GetJob to the actual newly created
app/branch/job ARNs after its ID is known; do not grant wildcard app access or guess an
ARN. Disable independent automatic starts if using this path; pin requested commit,
verify the Amplify job's actual commit, apply stale-main gates and record the build ID.
No such role/call is in this candidate until an actual app exists for exact scoping.

Release order: independent source/IAM/migration review; credential-free web hosting
canary to establish real origin; approved session migration rehearsal/production gate;
distinct API resource bootstrap and GitHub CI deployment; configure web to the actual
API/origin and release through checked hosting build; non-mutating health/unauthenticated
checks; user-entered password and reload/sign-out proof. No browser automation receives
a real credential. Backend deploy/rollback details are in deploy/ERP-RUNTIME-004.md.

Rollback: revert web candidate through hosting CI or remove server target to fail closed.
Keep the same host-only /auth cookie scope; never point to fixture/platform or reveal a
refresh token in browser JSON. Preserve deployment/build/hash records and session tables.
