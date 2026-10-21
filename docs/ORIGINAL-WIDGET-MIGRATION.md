# LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / ORIGINAL_WIDGET_AND_CLIENT_MIGRATION
TAG: LEEWAY-MODEL-HUB-ORIGINAL-WIDGET-RECOVERY-20261021
WHO: Leonard Jerome Lee (owner); OpenAI coding assistant (inspection)
WHAT: Preserve source authority while replacing embedded inference selection with standalone service
WHEN: 2026-10-21
WHERE: New LeeWay-Model-Hub source
WHY: Avoid duplicating or breaking the original HARDLINE 3D widget
HOW: Discover original widget and migrate its data boundary only after full source/license review
AUTHORITY: Development mapping, not UI production approval
LICENSE: LeeWay-authored text. Bundled upstream assets retain their separate notices.

## Original user-approved widget evidence

Inspected on the authorized Windows PC:

- Historical test wrapper: `E:\LeeWay-Work\AGENT-LEE-FLOATING-WIDGET-TEST\work\hardline-3d-widget-test-20261013\hardline-model-hub-native-test.cjs`
- Native test preload: same folder `hardline-model-hub-preload.cjs`
- Live Runtime Fabric compiled UI: `E:\LeeWay-Work\pc-consciousness-live\runtime\model-execution-runtime\models-ui.html`
- Observed original production UI: **968,514-byte compiled HTML**, title `Hardline 3D - LLM Execution Router & Hardware Estimator`.
- Original test wrapper has a hash/source gate and explicitly states `modelExecution: DENIED`, `formula: NOT_EXECUTED`, `veritas: NOT_EXECUTED`. It is a UI geometry/native-window test, not an inference provider.
- Original compiled UI is retained in the existing Runtime Fabric location and **has not been duplicated into this public repository** because it contains bundled dependencies requiring a provenance/license and content inspection.

The new `public/index.html` provides the **service-facing standalone widget**, not a pixel-identical claim to the Electron HARDLINE visualization. To complete preservation, review the original source and third-party notices, extract reusable presentation components, then have the native Electron browser window call `clients/model-hub-client.mjs` via an authorized IPC adapter. Keep owner token in trusted native host, not the HTML source.

## Old Pocket Agent migration

Legacy discovery source:
`https://github.com/4citeB4U/LeeWay-Pocket-Agent/tree/main/model-hub`.

**Canonical new source:**
`https://github.com/4citeB4U/LeeWay-Model-Hub`.

The old JSON catalog remains as a read-only compatibility snapshot during staged migration to avoid breaking clients. New clients must consume the canonical Model Hub URL `/v1/catalog` (authorized runtime) or static GitHub Pages `/catalog/models.json` (public discovery). The legacy record must not silently overwrite the new service's selection authority.

## Client execution

* Windows/macOS/Linux: use `createModelHubClient({baseUrl,ownerToken})`, one warmed host provider.
* Android/iOS: same HTTPS API client. No local GGUF required while a host is available; optionally use PocketPal GGUF download URI for offline inference.
* Workbench/chat history sync is a separate data service; model inference answers do not automatically persist or sync personal conversations.
* Cross-device sharing requires actual network routing and private/TLS authentication. The tested Android USB ADB reverse path is lab-only.

## Full-production evidence still needed

Canonical Formula decision semantics, LDWMD/VRAM memory admission, GPU physical backend readback, Continuum persistence, independent Veritas receipt and true Receipt/Learning Ledger admissions remain separate. The new Model Hub never claims these gates from GitHub hosting alone.
