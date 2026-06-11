# Entry realtime variable/list probe notes

Checked on branch: `feat/entry-cv-status-monitor`
Checked at: `2026-06-05`

## Probe file

- `tests/entry-cv-probe.mjs`
- Uses only Node built-ins: `fetch` and global `WebSocket`.
- Fetches `cloudServerInfo(id)` from `https://playentry.org/graphql` when `--project-id` is given.
- Connects to the Entry realtime data path `/cv/` with the cloud server query token redacted in normal output.
- Tries Socket.IO/Engine.IO websocket handshakes and waits for the `welcome` event.

## Reproduction

```powershell
node --check tests\entry-cv-probe.mjs
node tests\entry-cv-probe.mjs --project-id 6a224bbd3593fb268c148352 --eio 3 --timeout-ms 6000 --json
```

## Result

`node --check` passed.

The realtime server check did not receive a websocket open packet or a Socket.IO `welcome` event. All candidate `type` values timed out:

- empty type: `timeout`
- `workspace`: `timeout`
- `project`: `timeout`
- `variable`: `timeout`
- `list`: `timeout`
- `realtime`: `timeout`

Each timeout reason was `No welcome before 6000ms.`

## Current interpretation

The probe can obtain `cloudServerInfo` for a public project without logging in, but the `/cv/` realtime websocket endpoint currently does not complete the connection. This matches the current expectation that the Entry realtime variable/list server is not operating.

For the actual realtime variable/list feature, login should be treated as required. The bundled Entry language strings expose `login_needed`, `login_to_save`, and the realtime variable/list options are described as server-saved variables/lists.
