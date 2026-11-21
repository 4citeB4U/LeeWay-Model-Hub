# GitHub model-weight asset transport — independent Model Hub repair

**Authority:** LeeWay-Model-Hub canonical repository, `registry/leeway-model-hub-runtime-manifest.v1.json`.
**Scope:** Model Hub's own artifact transport, byte materialization, and evidence handoff. This does **not** create a second Continuum, Formula, GPU, Veritas, or receipt authority.
**Engineering status:** SOURCE IMPLEMENTED / SYNTHETIC BYTE TESTED / REAL WEIGHTS NOT MATERIALIZED / PRODUCTION ADMISSION BLOCKED.

## Inspected failure boundary (2026-11-06)

- The canonical runtime manifest declares three model packages and says `weightPayloadState: NOT_YET_HOSTED_IN_GITHUB`. The Model Hub repository had **zero GitHub Releases** when inspected.
- `qwen3-4b`: full 2,497,280,256-byte GGUF digest recorded, but `weightLicense: UNVERIFIED_LOCAL_IMPORT_LICENSE`. This cannot be published on the strength of an unreviewed license string. The file exceeds GitHub Release's 2 GiB single-asset limit.
- `qwen3-vl-8b-instruct`: Device Bridge readback now supplies SHA-256 entries for all required files, including `config.json` and `model.safetensors.index.json`; the manifest total is reconciled to the observed required-file bytes. The package remains local-only and unmaterialized.
- `wan2.1-t2v-1.3b`: Device Bridge readback now supplies SHA-256 entries for every required file, including `config.json`; the manifest total is reconciled to the observed required-file bytes. The `.pth` payloads still require separate pickle/security qualification before any execution, and the package remains local-only and unmaterialized.
- Draft PR #5 adds **owner-local GGUF import** via the existing Ollama provider. This transport repair complements it; it does not install or admit a model, update the public catalog, or bypass PR #5.

## Deterministic source-side transport (this PR)

`scripts/release-asset-bundle.mjs` implements three **owner-local** modes:

1. `audit`: machine-readable metadata gate; rejects unknown model IDs, missing required-file digests, inconsistent total byte counts, unsafe paths, and unverified license declarations.
2. `stage`: verifies existing owner-selected model files against the canonical manifest, splits them into at-most-1-GiB GitHub Release candidates, and independently hashes and reads back every part. Default is dry-run. `--apply` creates a new exclusive staging directory; no existing staging bundle is overwritten.
3. `materialize`: verifies a locally supplied, independently retrieved Release bundle's exact source-manifest SHA-256, every part's name, order, size and hash, and reconstructs exact files into a new exclusive output directory. Default is read-only verification. `--apply` reconstructs and re-reads all bytes. **This is materialization, not Continuum or Veritas admission.**

`stage` and `materialize` never contact a network, publish to GitHub, load models, modify Runtime Fabric, or mark any model `READY`. They do not accept HTTP requests or grant workers file-system access. A GitHub Release must be published by the existing owner-approved publishing mechanism, after license and integrity review. A Release name or metadata alone does not prove exact bytes; the recipient must reconstruct and hash all bytes.

### Read-only current-source audit

```bash
npm run assets:audit -- --model qwen3-4b
npm run assets:audit -- --model qwen3-vl-8b-instruct
npm run assets:audit -- --model wan2.1-t2v-1.3b
```

### After canonical manifest and license review, on an owner-approved host with real files

```bash
npm run assets:stage -- --model qwen3-4b --source-root /approved/model-assets --out /approved/release-staging
# Review the preflight evidence before an explicitly authorized mutation:
npm run assets:stage -- --model qwen3-4b --source-root /approved/model-assets --out /approved/release-staging --apply
```

The source root must contain the manifest's relative directory (for example `Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf`). Staging produces `<out>/<modelId>/release-assets.v1.json` and bounded `*.bin` parts. Preserve the manifest, part names, hashes, and the source commit identity. Do not put weights into normal Git history. Never silently publish files under an unverified license.

**Publishing gate (not performed):** Use the existing owner-authorized GitHub Release publishing mechanism to upload *exactly* the staged manifest and parts, then independently list the Release's assets and verify names/sizes/digests before treating the release as a transport source. GitHub's Release asset size, quota, billing, and licensing constraints must be checked. The current GitHub connector cannot upload these multi-GB binaries, and the authenticated Device Bridge exposes only read-only discovery, not file bytes or owner-authorized upload.

### After approved release asset retrieval

```bash
npm run assets:materialize -- --model qwen3-4b --bundle-root /approved/downloaded-release-assets --out /approved/materialized-models
# Only after dry-run verification:
npm run assets:materialize -- --model qwen3-4b --bundle-root /approved/downloaded-release-assets --out /approved/materialized-models --apply
```

The downloaded Release directory must contain the exact `release-assets.v1.json` and named parts. The reconstructed directory is **not** an execution grant. A separate authorized host process must submit the reconstructed model to **Continuum** for canonical durable storage, verify readback, invoke the actual canonical **Formula**, pass **independent Veritas PRE/POST**, bind qualified execution and provider residency, and obtain canonical **Receipt Authority** and **Learning Ledger** readback before production admission. The Model Hub must remain closed until those real authorities confirm the same model, bytes, source commit, request, and outcome. Do not implement substitute or self-signed authorities in this repository.

## Acceptance and rollback

Source acceptance: `npm test` and `npm run check` across the existing CI matrix, plus tests for real synthetic byte splitting/reassembly, tampering, missing hashes, unverified licenses, symlink escape, no mutation by default, stale source manifest, and exclusive output. These tests do not prove a real model, physical GPU, GitHub Release upload, Continuum, Formula, or Veritas.

Rollback: close the draft PR; no `main` source, existing provider state, model weights, canonical storage, or runtime policy is changed. A failed local staging or materialization operation cleans up only its own newly created output directory. No blind cleanup of owner files.

**Evidence state:** RECEIPT NOT CREATED; LEARNING LEDGER NOT UPDATED.
