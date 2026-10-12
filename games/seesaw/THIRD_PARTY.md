# Reused UCM connection code and vendored libraries

## UCM implementation inspected

- Repository: https://github.com/kkodamalab/ucm-demo-game
- Inspected main commit: `a1b1de47c30cc5e15d8e3af44b3d7049883525c9`
- `dist/app.js`: `PeerBus`, `url(role)`, `renderConnect`, `enhancedPlayerSafe`.
- `dist/index.html` and root `index.html`: PeerJS **1.5.5**, QRCode.js **1.0.0**.
- `server.js`: legacy Socket.IO room relay. The current HTML loads PeerJS, and its entry point calls `enhancedPlayerSafe` (not the obsolete `RoomBus` player). Therefore the egg game does **not** add Socket.IO or a second transport.

`src/peer-bus.js` extracts/adapts the existing PeerBus, removes UCM-specific global `state` writes, and retains `host`/`A`/`B`, `reliable:false`, metadata session IDs, `input`, `feedback`, and `input-config` messages. `src/qr-connection.js` reuses the same room=PeerJS-ID and `?room=...&player=A` URL/QRCode constructor pattern. Only player A is used by the egg game.

UCM has no independent reusable package and no automatic controller reconnect implementation in the inspected class. The extracted module adds reconnection/backoff, timeout, active-session protection and backpressure. This is a source extraction with provenance, **not a live shared npm package**. The UCM repository is unchanged. A later shared-package migration can adopt these modules in UCM after separate regression testing.

UCM's user-gesture permission, neutral capture, EMA, sequence/clientTimestamp and 34 ms coalescing patterns are preserved. The egg game's existing screen-rotation-aware TiltInput is reused on the controller, where sensor permissions and calibration now live. Tilt packets retain UCM envelope fields and add explicitly validated egg-game state/angle fields.

## Library copies

The same pinned versions as UCM are vendored for deterministic static deployment (no runtime CDN script dependency):

- `vendor/peerjs-1.5.5.min.js`: https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js — MIT; `vendor/peerjs-LICENSE`.
- `vendor/qrcode-1.0.0.min.js`: https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js — MIT; `vendor/qrcode-LICENSE`.

PeerJS still requires the default PeerServer signaling service/network connectivity, as in UCM. WebRTC networking restrictions can prevent direct connectivity. No custom signaling service, TURN credentials, or relay transport is silently added.
