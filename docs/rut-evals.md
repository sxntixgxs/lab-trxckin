# RUT extraction evals

How [Lab Trxckin](../README.md) measures the AI extraction that pre-fills supplier and customer onboarding from a Colombian RUT. Every document in the dataset is synthetic: the taxpayers, names, addresses and NITs are fictional, and the form is a look-alike of DIAN Form 001, not the official one.

## Context

The onboarding modal lets the requester upload the RUT (PDF, JPEG or PNG) and fills about ten form fields from it ([suppliers.md](suppliers.md#ai-rut-extraction)). The route used to send the file to a model and trust whatever JSON came back. Nobody validated the JSON or checked the NIT's check digit, the route didn't record which model answered or how long it took, and nobody knew how often the answer was right.

The evals answer three questions before any model or prompt change: is the output well-formed, is it correct field by field, and what does it cost in money and latency? The results are reproducible in CI without an API key.

## What it measures

| Metric | Meaning |
| --- | --- |
| Schema-valid rate | Share of documents where the call succeeded and the JSON passed the zod schema. A failed call or timeout counts as invalid, with every field wrong. |
| DV mismatches | Extractions whose DV does not match the DIAN check digit of the extracted NIT. |
| Field accuracy | Correct fields ÷ (documents × 15), against a golden answer per document. |
| Per-field and per-variant accuracy | Where the errors are: which fields, and which kinds of document. |
| Cost per document | `usage.cost` reported by OpenRouter (the price table in `lib/rut/models.ts` is only a fallback). |
| p50 / p95 latency | Wall time of the call, as the user waits for it. |

## Dataset

`evals/rut/dataset/` holds 20 fictional taxpayers (`entities.json`): 10 legal entities and 10 natural persons. The natural persons hold a cédula de ciudadanía, except one cédula de extranjería and one passport. Each taxpayer has a department, a municipality and an address, one or two CIIU activities as 4-digit codes, and a valid DV. `build.py` renders each one with a Typst template (`rut.typ`) that mimics page 1 of the RUT: numbered boxes, NIT and CIIU digit cells, the representation section, and distractors such as the trade name, the tax office city and the activity start dates. It then degrades each render according to its variant:

| Variant | Cases | What the model receives |
| --- | ---: | --- |
| `clean` | 8 | The PDF as Typst renders it, with a text layer. |
| `missing` | 2 | Clean PDF with optional boxes left blank (second surname, secondary activity, legal representative); the golden has `null`. |
| `scan` | 4 | Grey paper, grain, dust, slight blur and ±2° skew, as JPEG or as an image-only PDF. |
| `rotated` | 3 | Turned 90° (JPEG), 180° (image-only PDF) or −5° (PNG). |
| `lowres` | 3 | Downscaled to 72–90 dpi (PNG or JPEG). |

Each case folder has `document.*` (the upload) and `expected.json` (the 15 fields as the extractor should return them). The build is byte-for-byte deterministic, and the output (2 MB) is checked in so CI never needs Typst or Python. `dataset.test.ts` guards the goldens: each one must pass the schema, carry a correct DV and use CIIU codes that exist in the catalog.

## Checks, cheapest first

1. **Schema (zod, free).** `lib/rut/schema.ts` accepts the 15 fields as `string | null`. It turns numbers into strings, trims text, reads `""` and `"null"` as null and normalizes `tipo_contribuyente` to `natural` / `juridica`. Anything else, including prose instead of JSON, is invalid. The production route runs the same check.
2. **Output-only rules (free, no golden).** These can run on every production extraction:
   - the DV must equal `calcularDvNit(nit)`;
   - activity codes must be CIIU-shaped (3–4 digits, compared padded to 4);
   - required fields must be present for the taxpayer type;
   - the document type must be one the form recognizes.
   The route now returns the DV check as `_validation.dv_ok`.
3. **Field accuracy against the golden (free, needs the dataset).**
   - **Exact:** `nit`, `dv`, `numero_identificacion` and `tipo_contribuyente`. The two CIIU codes are also exact, compared as padded 4-digit codes.
   - **By category:** `tipo_documento` is compared the way the form uses it (`NIT`, `C.C.`, `C.E`, `P.A.`), mirroring `mapTipoDoc` in the onboarding modal.
   - **Normalized:** names, razón social, departamento, municipio and dirección are compared after lowercasing and removing accents, dots and `, # -`. The legal representative is compared as a set of words, because models legitimately write the name as either "given names + surnames" or "surnames + given names".
   - **Nulls:** a value where the golden has `null` (hallucinated) is wrong, and so is a `null` where the golden has a value (missed).
4. **Live model calls (paid).** Only when recording. Replays re-run checks 1–3 on the recorded responses.

## Thresholds

`evals/rut/thresholds.json` gates the route's two models. The runner exits 1 and names each broken threshold.

| Threshold | `gemini-3.1-flash-lite` (primary) | `deepseek-v4.1-flash` (fallback) | Why |
| --- | ---: | ---: | --- |
| `min_schema_valid_rate` | 0.95 | 0.95 | Both measured 100%. One bad answer in 20 is tolerated as provider noise; two are not. |
| `min_overall_field_accuracy` | 0.96 | 0.92 | Measured 98.3% (twice) and 96.3%. A variant that falls apart (all three rotated cases, say) drops below the gate. |
| `max_dv_mismatches` | 0 | 4 | Gemini measured 0 in both runs after the prompt fix, so any NIT/DV error now fails the build. DeepSeek's gate holds its measured baseline; its target is also 0. |
| `max_p95_latency_ms` | 10000 | 30000 | Measured 1.9 s and 12.3 s. The route times out at 45 s per model; the gates catch a slow provider or a reasoning blow-up before users feel it. |

## How to run it

```sh
pnpm eval:rut                                   # replay the recorded cassettes: no key, no network
pnpm --filter frontend eval:rut:live            # needs OPENROUTER_API_KEY; re-records everything
pnpm --filter frontend exec tsx evals/rut/run.ts --mode live --models google/gemini-3.1-flash-lite-preview --cases 'rut-1*' --budget-usd 0.5
python apps/frontend/evals/rut/dataset/build.py # rebuild the dataset (Python 3 + Pillow + typst CLI)
```

- **Replay** loads `cassettes/<model>/<case>.json`. Each one holds the raw provider response body, the parsed usage, the latency, the answering model, a timestamp, and the SHA-256 of both the document and the prompt. Replay then parses, validates and scores it with the current code. A cassette recorded against a different document **or a different prompt** fails the run instead of being scored as if nothing changed, so a prompt edit cannot pass CI on old recordings: it has to be re-recorded live.
- **Live** mode runs four calls at a time and stops once `--budget-usd` (default 2) is spent. It also probes the retired `google/gemini-2.0-flash-001` once, to keep that finding reproducible. Recordings never include the key or request headers, and the OpenRouter account id in error bodies is removed.
- Every model receives `document.*` through `extractRut`, the same function the route calls. PDF-capable models get the file as uploaded; for image-only models, `extractRut` renders page 1 of a PDF to PNG with pdf.js (`lib/rut/pdf-image.ts`), exactly as production does, and the rendering time counts in the latency. A new model must first be added to `lib/rut/models.ts` with its input type and price.
- Output: `evals/rut/report.md` (tables and failing fields) and `evals/rut/summary.json`.

## CI

[`.github/workflows/rut-evals.yml`](../.github/workflows/rut-evals.yml) runs with `contents: read`:

- **Pull requests** that touch `lib/rut/`, the extraction route, `evals/rut/` or the workflow run the replay. They need no secrets. The job writes the summary table to the run summary and uploads `report.md` and `summary.json` as the `rut-evals` artifact, and it fails when a gate breaks.
- **Manual runs** (`workflow_dispatch`, input: models and budget) call OpenRouter with the `OPENROUTER_API_KEY` secret. The job uploads the new cassettes with the report. Nothing is committed from CI: to adopt a recording, download the artifact and commit it in a PR.

The logs are public, so the runner prints only scores, latency and cost per call.

## Results (2026-09-27)

20 documents. The current recordings (after the changes below):

| Model | Role | Input | Schema-valid | DV mismatches | Field accuracy | Mean cost/doc | p50 latency | p95 latency |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.1-flash-lite-preview` | primary | document as uploaded | 100.0% | 0 | 98.3% | $0.000585 | 1.6 s | 1.9 s |
| `deepseek/deepseek-v4.1-flash` | fallback | PDF page 1 → PNG (pdf.js), images as uploaded | 100.0% | 4 | 96.3% | $0.002790 | 6.4 s | 12.3 s |

| Variant | gemini-3.1-flash-lite | deepseek-v4.1-flash |
| --- | ---: | ---: |
| clean (8) | 95.8% | 99.2% |
| missing (2) | 100.0% | 100.0% |
| scan (4) | 100.0% | 100.0% |
| rotated (3) | 100.0% | 91.1% |
| lowres (3) | 100.0% | 86.7% |

The per-field table and every failing case/field pair are in `apps/frontend/evals/rut/report.md`. All live runs of the day (baseline, prompt fix, repeat, fallback re-record, probes) cost about US$0.30.

## What changed because of the evals

| | Before | After |
| --- | --- | --- |
| Route primary | `gemini-2.0-flash-001`: retired, **HTTP 404 on every call**, so each extraction paid a failed round trip | `gemini-3.1-flash-lite-preview`, the model that was silently serving production |
| Route fallback | `gemini-3.1-flash-lite-preview` | `deepseek-v4.1-flash`, a different vendor, with server-side PDF rendering |
| NIT/DV prompt rule | "NIT should NOT include the DV digit" | Names box 5 (NIT) and box 6 (DV) and forbids moving digits between them |
| Gemini NIT accuracy | 65% (scans, rotated and low-resolution: 5–7 of 10 NITs lost their last digit) | 100% |
| Gemini DV mismatches | 5 and 7 in two runs | 0 and 0 |
| Gemini field accuracy | 97.0% and 95.3% | 98.3% and 98.3% |
| Gemini on images (scan, rotated, lowres) | 91.1–96.7% | 100% |
| DV gate | none (the route trusted the JSON) | 0 for the primary, and `_validation.dv_ok` in every response |

The prompt fix cost nothing per call: same model, same tokens (mean cost $0.000571 → $0.000585 per document).

## Findings

- **The route's primary model was gone.** `google/gemini-2.0-flash-001` is no longer listed in OpenRouter's `/api/v1/models`, and the probe returns HTTP 404 "No endpoints found". Every production extraction failed once and was served by the fallback. Nothing surfaced it, because the fallback worked.
- **A prompt rule caused the NIT errors.** Text PDFs had no NIT errors, but on image inputs Gemini dropped the NIT's last digit, most likely by applying "NIT should NOT include the DV digit" to the NIT itself. Naming the two boxes removed the error in both repeat runs. The DV check (free, no LLM) flagged every one of those errors, which is why it now ships in the route response.
- **Gemini's remaining errors are one document.** In rut-03, a legal entity, it copies the legal representative into the natural-person fields (5 of its 5 wrong fields).
- **How a model gets the document matters as much as the model.** DeepSeek scored 77.7–90.0% on the Typst-rendered page images and 96.3% on the same pages rendered by pdf.js, which is what the route sends. Its p95 dropped from 29–45 s to 12.3 s. Evals have to run the production input path, not an approximation of it.
- **DeepSeek is cheap per token but not per document.** It reasons by default (about 1,800 reasoning tokens per document), and OpenRouter spreads its calls across providers that bill above the list price: $0.0028 per document, 4.8× Gemini. That is acceptable for a fallback that only runs when Gemini fails, not for the primary.
- **DeepSeek's errors are digit-level.** It fuses or duplicates NIT digits (4 DV mismatches, all caught by the DV check) and sometimes reads an activity start date (`2017`, `20200918`) as a CIIU code; the CIIU-shape check catches the 8-digit dates but not the 4-digit ones.
- **Variance is real.** Before the fix, the same prompt scored 97.0% and 95.3% with 5 and 7 DV mismatches across two runs. The primary's gates rest on two runs; the fallback's on one.
- **CIIU leading zeros.** RUTs print 4-digit codes, and both models return `0111` or `0123`. The CIIU catalog (`lib/catalogs/ciiu.ts`) keys drop the zero (`"111"`), so the modal fills the code but leaves the activity description empty for sections 01–09 (agriculture, mining). The eval compares padded codes; the UI lookup is not fixed yet.

## Code map

- [`lib/rut/extract.ts`](<../apps/frontend/lib/rut/extract.ts>): `extractRut` (timeout, usage, typed `RutExtractionError`), `inputForModel`, `readRutResponse` and `checkDv`
- [`lib/rut/pdf-image.ts`](<../apps/frontend/lib/rut/pdf-image.ts>): page 1 of a PDF to PNG (pdf.js on `@napi-rs/canvas`) for image-only models
- [`lib/rut/schema.ts`](<../apps/frontend/lib/rut/schema.ts>), [`lib/rut/prompt.ts`](<../apps/frontend/lib/rut/prompt.ts>), [`lib/rut/models.ts`](<../apps/frontend/lib/rut/models.ts>), [`lib/rut/nit.ts`](<../apps/frontend/lib/rut/nit.ts>): schema, prompt, model registry and DIAN check digit
- [`api/extract-rut/route.ts`](<../apps/frontend/app/api/extract-rut/route.ts>): auth, file checks, primary → fallback (also on schema failures), `_usage.model`, `_usage.latency_ms` and `_validation.dv_ok`
- [`evals/rut/scoring.ts`](<../apps/frontend/evals/rut/scoring.ts>): checks, field comparison, aggregation and gates
- [`evals/rut/run.ts`](<../apps/frontend/evals/rut/run.ts>): replay and live runner, cassettes and report
- [`evals/rut/dataset/`](<../apps/frontend/evals/rut/dataset/>): entities, Typst template, build script and generated cases

## Tests

- [`lib/rut/extract.test.ts`](<../apps/frontend/lib/rut/extract.test.ts>): success, provider cost vs price table, fence stripping and normalization, which input each model gets, and schema, parse, HTTP and timeout failures
- [`lib/rut/pdf-image.test.ts`](<../apps/frontend/lib/rut/pdf-image.test.ts>): renders a real dataset PDF to PNG
- [`api/extract-rut/route.test.ts`](<../apps/frontend/app/api/extract-rut/route.test.ts>): authorization, file checks, the new response fields, fallback on schema failure (with the PDF sent to DeepSeek as PNG), and both models failing
- [`evals/rut/scoring.test.ts`](<../apps/frontend/evals/rut/scoring.test.ts>), [`evals/rut/dataset.test.ts`](<../apps/frontend/evals/rut/dataset.test.ts>), [`lib/rut/nit.test.ts`](<../apps/frontend/lib/rut/nit.test.ts>): scoring rules, golden integrity and the DV algorithm

## Known limitations

- The dataset is synthetic and covers only page 1. Real RUTs have more pages, stamps, different fonts and genuine scanner artifacts, so these numbers are an upper bound for clean inputs and a rough guide for degraded ones.
- There are 20 documents, so a single document moves accuracy by up to 5 points; the gates rest on two live runs for the primary and one for the fallback.
- Replay proves that the code and scoring reproduce the numbers; it does not show model drift. That needs a manual live run.
- The fallback path renders PDFs without pdf.js standard font data, so a PDF relying on non-embedded base-14 fonts may render poorly for DeepSeek. The primary reads PDFs natively.
- Server-side rendering depends on `@napi-rs/canvas`'s prebuilt Linux binary in the Next.js image; it is tested on Windows and in CI (Ubuntu), not yet in the deployed container.
