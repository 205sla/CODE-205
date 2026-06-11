# Entry realtime variable/list status monitor plan

Branch: `feat/entry-cv-status-monitor`
Created: `2026-06-05`

## Final monitoring policy

The production monitor must test the Entry realtime variable/list server at a minimum interval of 1 hour.

This feature is only a status monitor. It must not continuously poll, stress-test, fuzz, or load-test Entry servers.

Planned constraints:

- Run at most 1 realtime status check per monitored target every hour.
- Do not run parallel websocket probes against the same target.
- Use a short connection timeout, currently 6-8 seconds.
- Store only redacted metadata; never store the `cloudServerInfo.query` token.
- Record failed checks as normal status history, not as retry storms.
- If the server is down, wait until the next hourly interval instead of immediate repeated retries.
- Show the latest status and history on `code.205.kr`, but keep the monitor itself lightweight.

## Suggested log fields

- `checkedAt`
- `projectId`
- `targetUrl`
- `engineIoVersion`
- `type`
- `status`
- `ok`
- `elapsedMs`
- `reason`
- `eventCount`

Suggested status mapping:

- `UP`: websocket handshake completed and `welcome` was received.
- `DOWN`: timeout, websocket error, close before `welcome`, or Socket.IO error.
- `UNKNOWN`: configuration missing, project not found, login/session requirement not satisfied, or probe could not fetch server info.

## Facts learned so far

- Entry realtime variable/list uses a realtime data endpoint under `/cv/`.
- A project-specific `cloudServerInfo(id)` GraphQL query returns the realtime server URL and query token.
- GraphQL requests to `https://playentry.org/graphql` require a CSRF token/cookie pair.
- A public project can return `cloudServerInfo` without an authenticated login session, but the resulting query token can represent an anonymous user context.
- The actual realtime variable/list feature should be treated as login-required. The bundled Entry UI strings include `login_needed`, `login_to_save`, and realtime variable/list labels that describe server-saved data.
- Current probe results show no websocket open packet and no Socket.IO `welcome` event from `/cv/`; every tested type timed out.
- The current result is consistent with the Entry realtime data type server being unavailable.
- The probe supports Engine.IO `3` and `4`; EntryJS-era Socket.IO clients commonly need Engine.IO `3`, so production checks should keep that compatibility until the live protocol is verified.
- Entry realtime lists can error when they have 15 or more items even if the realtime server is healthy. Routine monitoring must not classify that case as a server outage by itself.

## Additional tests needed

- Verify the same probe with a logged-in Entry session cookie.
- Verify a project that definitely has `hasRealTimeVariable: true`.
- Confirm the exact `type` query value used by the live Entry client for realtime variables/lists.
- Compare the built-in Node websocket probe with the real `socket.io-client` version used by EntryJS.
- Confirm owner, participant, and anonymous behavior separately.
- Confirm whether the server returns a fast error, timeout, or `welcome` when it recovers.
- Decide whether the production monitor should check one known project only, or allow a configurable target list.
- Decide log retention period and whether old records should be compacted daily.
- Add a UI status page test after the backend monitor is implemented.
- Add a guard that prevents manual refresh buttons from bypassing the 1-hour minimum interval.
- Add a list-size guard if write/read validation is implemented: keep the monitor test list at 14 or fewer items and clean it up after each validation.

## Current reproduction command

```powershell
node --check tests\entry-cv-probe.mjs
node tests\entry-cv-probe.mjs --project-id 6a224bbd3593fb268c148352 --eio 3 --timeout-ms 6000 --json
```
