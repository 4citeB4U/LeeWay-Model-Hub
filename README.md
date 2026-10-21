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
                  +-- LeeWay GPU inference provider (contract only; not bound)
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

## GPU boundary

The existing [LeeWay Edge GPU](https://github.com/4citeB4U/LeeWay-Edge-GPU) contains WebGPU shaders, browser-native dispatchers and standalone acceptance classifiers. Its `g19-standalone-gpu-acceptance.mjs` explicitly distinguishes GPU component execution from independently verified GPU provider/LLM inference. The API accepts a configured future `LEEWAY_GPU_INFERENCE_URL` only if it returns `GET /v1/capabilities` with:
```json
{"schema":"leeway.gpu.inference.v1","modelInference":true,"gpuVerified":true,"receiptId":"external-real-receipt","models":["gemma-3-1b-q4km"]}
```
and implements `POST /v1/models/activate` and `POST /v1/generate`. That is a **provider-reported contract**, not proof of independent Veritas or actual GPU hardware qualification: separate evidence checks remain mandatory. Absent binding, GPU is **NOT QUALIFIED**, never silently replaced by CPU while labeled GPU.

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
