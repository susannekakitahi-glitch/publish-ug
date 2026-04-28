# Test plan — PR #9 (per-post status sync)

## What changed in user-visible terms

When a scheduled post has been pushed to Zernio (has a `zernioPostId`), `/schedule` now:
- polls Zernio's `GET /v1/posts/{id}` and `GET /v1/analytics?postId=…` on mount and on tab change,
- flips the local card from `queued` → `sent` if Zernio reports the post `published`,
- stamps `failureReason` with per-platform errors on partial / failed publishes,
- overwrites seeded reach/clicks with real numbers when the Analytics addon is enabled (and forwards 402/202 gracefully when it is not),
- renders a new `Sent via Zernio · id <first-8-chars>…` line on cards that synced.

Mock mode is untouched — posts with no `zernioPostId` do not poll.

## Honest scoping note

The literal "schedule a real post → confirm sync flips it to Sent" flow requires a Zernio profile with at least one connected social account (i.e. completed Facebook OAuth). The previous test session deliberately stopped short of that step, so Susanne's Default profile has 0 connected accounts and the publish path will be rejected at <ref_snippet file="/home/ubuntu/repos/publish-ug/src/lib/state.tsx" lines="455-461" /> with `failureReason: "No Zernio-linked accounts for …"`.

To still adversarially prove the sync mechanism without OAuth completion, the plan injects a synthetic `sent` post with a Zernio postId into localStorage (DevTools), then verifies the *exact* network calls and DOM signature that PR #9 introduces. Each assertion is designed so a broken implementation would produce visibly different output. The honest gap (real Zernio publish → real flip) is called out explicitly in the report so the reviewer is not misled.

## Primary flow & assertions

### Setup (not part of recording)
1. Open https://dist-cbqwotij.devinapps.com (live preview, points at Render backend).
2. Open DevTools → Network tab.

### Test 1 — Plumbing: `/schedule` mount fires the new sync routes against Render

**Steps**
- In DevTools → Application → Local Storage → `https://dist-cbqwotij.devinapps.com`, edit `posta-ug:v2`. Add a synthetic post into the `posts` array with shape:
  ```json
  {
    "id": "synthetic-pr9",
    "kind": "status",
    "text": "PR #9 sync test — synthetic post (DO NOT publish)",
    "platforms": ["facebook"],
    "scheduledAt": "<5 minutes ago ISO>",
    "status": "sent",
    "createdAt": "<10 minutes ago ISO>",
    "reach": 2140,
    "clicks": 57,
    "zernioPostId": "fake-zid-pr9-test"
  }
  ```
- Hard reload the tab. Navigate to `/schedule` → click the **Sent** tab.
- Watch DevTools Network.

**Pass criteria (all must hold; broken sync would miss any of these)**
- Network shows `GET https://posta-backend-fy61.onrender.com/posts/fake-zid-pr9-test` → `404` (Zernio's 404 forwarded by the new proxy route — proves the route exists and the frontend hit it).
- Network shows `GET https://posta-backend-fy61.onrender.com/analytics/post/fake-zid-pr9-test` → `402` or `404` (proves the analytics proxy is reachable; 402 means addon-not-enabled fallback, 404 means Zernio doesn't know that postId).
- The DOM card on the Sent tab still shows the original text and **does NOT** flip to `failed` or get its reach/clicks zeroed (proves the discriminated-union "not_found / error → leave local state alone" branch in `applyZernioStatus` works; a broken implementation that wrote to state on every response would visibly corrupt the card).
- The card renders the new line `Sent via Zernio · id fake-zid…` (from <ref_snippet file="/home/ubuntu/repos/publish-ug/src/pages/Schedule.tsx" lines="353-356" /> — this DOM string only exists in PR #9; if the build on the preview hadn't picked up the merge, the line would be missing).

### Test 2 — Mock-mode posts are not polled (regression)

**Steps**
- In the same localStorage, add a second synthetic post identical to Test 1 but with `id: "synthetic-mock"`, no `zernioPostId` field, and `status: "sent"`.
- Hard reload. Click **Sent** tab. Filter Network by `posts/`.

**Pass criteria**
- Network shows **only one** `GET /posts/…` request (the one for `fake-zid-pr9-test`), **not two**. If the sync forgot to filter on `zernioPostId`, the mock post would also fire a `GET /posts/undefined` against Render — that must not happen.
- The mock-mode card still renders without the `Sent via Zernio · id …` line (the new UI is correctly gated on `p.zernioPostId &&`).

### Test 3 — Mode-flip regression: backend ENV change is reachable

**Steps**
- Direct curl: `curl -i https://posta-backend-fy61.onrender.com/posts/anything` from the test machine before the recording starts.

**Pass criteria**
- HTTP 404 with `X-Render-Origin-Server: uvicorn` (proves Render redeployed after the merge and the new route is live).
- NOT a `405 Method Not Allowed` or FastAPI `{"detail": "Not Found"}` for an unrouted path.

## What this plan does NOT prove (called out in report)
- Real upstream `published` → local `sent` flip (requires OAuth completion).
- Real reach/clicks overwriting seeded numbers (requires Analytics addon + a published post).
- The 202 backend forwarding (added in `d62f4a0`) — only triggered by Zernio when analytics are syncing for a freshly-published post; cannot synthesize without a real publish.

## Recording
One continuous recording covering Tests 1 + 2 in the browser. Test 3 is a single curl, captured as text in the report (no recording value).
