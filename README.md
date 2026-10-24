# LeeWay Model Hub

Independent, portable, source-controlled **LeeWay Model Hub** microservice and responsive widget.

**Owner / source authority:** LeeWay Industries · Leonard Jerome Lee.
**State:** functional local inference candidate. **Not** production-certified GPU/Formula/Veritas.

## Screenshot repair and expanded PocketPal discovery — 2026-10-21

The earlier public widget mistakenly used `location.origin` on GitHub Pages as the inference API. The website returned HTML for `/v1/chat`, causing `SyntaxError: Unexpected token '<'`. The widget now **never** treats GitHub Pages or Vercel as a model inference endpoint. Its public catalog and live HF GGUF discovery work without an API; model activation and chat stay disabled until an actual owner-authorized Model Hub service is connected. Incorrect HTML responses now produce readable service errors rather than appearing as chat output.

The canonical catalog contains **five registered model identities**. As observed on the owner PC, **four were installed** (Gemma 3 1B GGUF, Gemma 4 e4b, Qwen 3.5 4B and Qwen 2.5 0.5B); Gemma 3 270M was catalog-only. This is not intended to enumerate the Hugging Face ecosystem. PocketPal can search public GGUF repositories via its existing Hugging Face integration, and the public LeeWay widget now has equivalent **discovery-only** search; discovery is not automatic authorization, download or inference.

`MODEL_HUB_AUTOSTART_MODEL=gemma-3-1b-q4km` instructs the owner-side runtime to wake one selected, already-installed model on startup. The owner deployment also set `MODEL_HUB_KEEP_ALIVE=-1` (sent to Ollama as a **number**) so the selected model requests indefinite residency, subject to host memory constraints. Selecting a different allowlisted, installed model unloads the previous one and activates the new model. Tests verified real Gemma → Qwen 2.5 0.5B → Gemma switching with the reported active model matching the provider's response.

The owner-local launcher `.local/start-modelhub.ps1` is **not committed**; it loads a private bearer token from `.local/auth-token.txt`. A per-user Windows Startup entry was installed for auto-launch after logon. A Task Scheduler setup was rejected by the OS (access denied) and not used. The startup launcher avoids creating a duplicate if the service already listens on the assigned port. Persistence after reboot has **not** been independently demonstrated.

**Live URLs:**
- Static UI: https://4citeb4u.github.io/LeeWay-Model-Hub/
- Vercel UI: https://leeway-model-hub.vercel.app/
- Owner's local inference host: `http://127.0.0.1:8879/` (available only on host or an authorized development tunnel)
- Native PocketPal GGUF picker: `pocketpal://hub/run` only where PocketPal is installed.

**Qualification boundary:** No authenticated public HTTPS inference endpoint or physical LeeWay GPU **LLM** provider is bound. The selected installed model was observed in Ollama at **0 reported VRAM bytes**, so neither the UI nor the service claims LeeWay GPU acceleration. Real GPU compute evidence and canonical Formula/LDWMD/Continuum/Veritas admission are independent gates. Cross-device public connectivity, mobile offline model inference and iOS acceptance remain unverified for the new service.

## Why separated

Pocket Agent Lee used to contain a small Gemma model catalog at `model-hub/catalog/portable-gemma.v1.json`. This repository extracts that selection contract into **one shared Model Hub**, preserving Pocket Agent and SlowLane as clients rather than creating competing authorities. The existing native floating widget remains an independent UI host; this repo provides an embeddable responsive service UI. Do not delete historical source until adapters have passed tests.

## Architecture

```text
GitHub = source + model catalog + Pages UI
Vercel = optional HTTPS API/router (only with an approved reachable backend)
      | 
      +-- LeeWay Model Hub /v1/catalog /v1/models /v1/models/activate /v1/chat
                  |
             Provider selection (one active model)
                  +-- Ollama/llama.cpp on an authorized persistent host (implemented)
                  +-- LeeWay GPU inference provider (qualified consumer implemented; trusted binding required)
                  |
      Pocket Agent Lee / SlowLane / LeeWay Logistics / desktop browser / iPhone
```

A GitHub Pages WebGPU shader runs on the **viewer's local GPU**, not on GitHub infrastructure. A published GPU repository is not an inference server. Vercel can expose an authenticated endpoint to an existing powered-up LeeWay compute host; it does not create persistent GPU capacity. If no backend is registered, the widget reports `UNAVAILABLE`. An independent LeeWay GPU **LLM inference provider** must pass `/v1/capabilities` and physical/evidence admission before it can be routed.

## Run on Windows, macOS or Linux (Node 20+)

Install Ollama separately and pull an allowlisted GGUF model. On Windows the tested model was:

```powershell
ollama pull hf.co/lmstudio-community/gemma-3-1b-it-GGUF:Q4_K_M
$env:MODEL_HUB_TOKEN = 'your-private-random-token'
node src/server.mjs
```

Open `http://127.0.0.1:8879/`. Choose a model, **Wake / Switch**, then chat. After activation Ollama keeps the selected model warm for 20 minutes between calls, subject to host memory pressure and provider policy. Switching unloads the prior Ollama model; it does not promise zero loading delay.

The service binds only to loopback by default. When serving other devices, use authenticated HTTPS reverse proxy or a private overlay/VPN; do **not** expose the plain HTTP service or Ollama port to the public internet. ADB reverse is suitable only for controlled USB development tests. The in-memory owner token is required for model activation and inference. Requests without it fail closed.

## API contracts

- `GET /health` - actual HTTP service process status, not a production certificate.
- `GET /v1/catalog` - canonical allowlisted model identities and model terms.
- `GET /v1/models` - installed and warm status (upstream Ollama inventory).
- `GET /v1/status` - selected model, provider, GPU provider qualification state.
- `POST /v1/models/activate` - authenticated `{"modelId":"gemma-3-1b-q4km","backend":"OLLAMA"}`.
- `POST /v1/chat` - authenticated `{"message":"..."}`, returns real provider inference.
- `GET /widget` - embeddable UI.

`MODEL_HUB_TOKEN` is required. The inference provider accepts **only models in catalog/models.json**. Third-party Hugging Face/Gemma licenses govern weight files separately.

## Qualified LeeWay GPU consumer

The Hub consumes the existing **LeeWay Edge GPU** service identity, `leeway.gpu.service`, through `/v1/capabilities`, `/v1/models/activate`, and `/v1/generate`. The consumer implementation is `src/qualified-gpu-client.mjs`. Its contract is portable: an explicitly configured HTTPS endpoint works across hosts; HTTP is limited to loopback development. Credential-bearing URLs, query strings, redirects, and provider addresses supplied through request JSON are rejected. Trusted startup must provide client authentication and independent qualification and result verifiers; without them the provider stays unavailable. These callbacks are not accepted from API requests or environment booleans.

Trusted deployment startup supplies these functions to `createHub(...)` or `start(...)`:

- `authenticateGpuRequest({operation, endpoint, modelId?, requestId?, sessionId?})` returns `{clientId, headers}`. Only `authorization` or `x-leeway-client-proof` headers are accepted. The existing startup-only `gpuToken` remains an alternative authentication adapter with client identity `leeway.model-hub`.
- `verifyGpuQualification({capabilities, endpoint, clientId})` independently verifies the existing issuer's qualification, trusted source/model identities, scope, freshness, and revocation. It must return primitive `true` after verification. Shape checks and `gpuVerified:true` are insufficient.
- `verifyGpuResult({request, result, qualification, endpoint, clientId})` independently verifies the exact request, authenticated client, decoded output, model/tokenizer/implementation identities, Formula and replay receipts, LDWMD lease, Continuum readback, POST, commit attestation, Receipt Ledger and Learning Ledger evidence. It must return primitive `true` after verification.

Missing authentication or either verifier keeps the qualified route unavailable. These adapters are injected by the trusted host; the Hub neither creates signing keys nor issues grants. Running the ordinary CLI with only a GPU URL and token does not qualify a provider.

Activation validates the service, model, backend and `SELECTED_NO_MODEL_EXECUTION` response before changing the selected model. It creates a Hub session ID without claiming that model weights are warm. Every generation rechecks qualification, sends a fresh request ID and the selected session ID, correlates the full returned `executionBinding`, and preserves that evidence in the response after independent verification. Inference and model switching are serialized, and a disconnected HTTP caller cancels the provider request. Optional `/v1/chat` fields are `requestId`, `sessionId`, and `maxNewTokens` (1–64); a foreign session is rejected. Provider authentication material never enters request JSON.

When `LEEWAY_GPU` is selected, `/v1/models` reports the qualified provider's catalog rather than querying Ollama. Installation and residency remain unknown unless separately observed. A failed GPU activation or request retains the selected backend and reports failure; it does not execute another provider.

Set `MODEL_HUB_GPU_REQUIRED=true` for an explicitly qualified-GPU-only deployment. It selects `LEEWAY_GPU` as the initial route and rejects Ollama and preview activation. It cannot be combined with `MODEL_HUB_GPU_PREVIEW_ONLY`. Without that setting, the original initial route and explicitly selected preview modes remain available. Omitting a backend during a later activation retains the current route.

The focused tests use synthetic upstream and verification fixtures. They establish consumer correlation and rejection behavior; they do not establish physical model execution or canonical production admission.

### Provider discovery contract

The existing [LeeWay Edge GPU](https://github.com/4citeB4U/LeeWay-Edge-GPU) exposes a configured `LEEWAY_GPU_INFERENCE_URL` through the following discovery shape, which the trusted consumer verifier must independently qualify:
```json
{"schema":"leeway.gpu.inference.v1","serviceId":"leeway.gpu.service","modelInference":true,"gpuVerified":true,"receiptId":"qualification-reference","models":["gemma-3-1b-q4km"]}
```
The provider also implements `POST /v1/models/activate` and `POST /v1/generate`. Discovery remains a provider report until the trusted verifier accepts it; each generated response requires its own independently verified execution evidence.

### Paired LeeWay GPU preview

`LEEWAY_GPU_PREVIEW_URL` is a separate opt-in adapter for the paired Device Bridge preview API (`GET /v1/inference/status`, `GET /v1/models`, and `POST /v1/chat/completions`). Select **LeeWay GPU · paired workstation preview** explicitly in the Hub. It sends the catalog model's exact Ollama/Hugging Face tag through the LeeWay client and accepts a response only when the service reports `REMOTE_GPU_PREVIEW`, `UNADMITTED_PREVIEW`, a physical device, and `FULL_MODEL_IN_VRAM` with VRAM bytes at least as large as model bytes. The currently tested workstation runner is the LeeWay Ollama CUDA preview adapter; the UI exposes that runner name on each response. This path does not change `leeWayGpu.gpuInferenceQualified` or production admission.

After a chat response, **Where the last answer ran** shows the selected route, provider-reported compute runtime/device/VRAM, authority state, and response time together. These fields describe that response only. `UNADMITTED_PREVIEW` stays visible, and provider headers do not substitute for independent host verification or production Veritas.

For a single-device client installation that must never contact its local Ollama provider, set `MODEL_HUB_GPU_PREVIEW_ONLY=true` and configure `LEEWAY_GPU_PREVIEW_URL` to that device's loopback LeeWay GPU client. The Hub then offers no Ollama fallback and refuses every other backend. Bind the Hub to loopback. `MODEL_HUB_LOCAL_UI_SESSION=true` creates a random in-memory owner token for that loopback session and fills it into the same-origin UI; do not enable this when binding to a LAN or public interface. This path is an explicit model API, not a Windows-enumerated virtual GPU or a replacement for a signed WDDM driver. It remains a preview until the canonical Formula, LDWMD, Continuum, independent Veritas, receipt, and Learning Ledger gates are connected and accepted.

## Clients and mobile

PocketPal's `pocketpal://hub/run` links are optional download-selection handoffs for offline phone-local models. They are **not** the cloud inference service. A phone without installed models can call an authorized LeeWay Model Hub runtime over the network through the same API. On disconnection, offline operation requires a local, separately installed model. Chat results are returned to the requesting client; no cross-device conversation database is asserted.

## Security and portability

No public secrets. Model contents and end-user paperwork are not committed. No arbitrary URLs in requests, no arbitrary model downloads via the API, bounded input, bearer-token activation, opt-in CORS allowlist. For production: TLS, per-client identities, rate limiting, tenant isolation, external authority, independent verification, canonical Formula/LDWMD/Continuum admission and receipt signing must be integrated before exposing it as a shared internet service.

## Test

```sh
npm test
```

This runs deterministic contract tests against a mocked Ollama backend; passing tests do **not** certify GPU or production.

## Source and provenance

LeeWay Pocket Agent source catalog: https://github.com/4citeB4U/LeeWay-Pocket-Agent/blob/main/model-hub/catalog/portable-gemma.v1.json
PocketPal MIT reference: https://github.com/a-ghorbani/pocketpal-ai
LeeWay Edge GPU: https://github.com/4citeB4U/LeeWay-Edge-GPU
Gemma weights: separately licensed by Google. No upstream model weights or PocketPal code is republished here.
