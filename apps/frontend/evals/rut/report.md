# RUT extraction evals

20 synthetic RUTs (8 clean, 3 lowres, 2 missing, 3 rotated, 4 scan). Recorded 2026-09-27 to 2026-09-27.

<!-- summary:start -->
| Model | Input | Schema-valid | DV mismatches | Field accuracy | Mean cost/doc | Total cost | p50 latency | p95 latency | Gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `deepseek/deepseek-v4.1-flash` | PDF page 1 → PNG (pdf.js); images as uploaded | 100.0% | 4 | 96.3% | $0.002790 | $0.055807 | 6.4 s | 12.3 s | pass |
| `google/gemini-3.1-flash-lite-preview` | document as uploaded | 100.0% | 0 | 98.3% | $0.000585 | $0.011694 | 1.6 s | 1.9 s | pass |
<!-- summary:end -->

## Per-field accuracy

| Field | `deepseek/deepseek-v4.1-flash` | `google/gemini-3.1-flash-lite-preview` |
| --- | ---: | ---: |
| `nit` | 80.0% | 100.0% |
| `dv` | 100.0% | 100.0% |
| `tipo_contribuyente` | 100.0% | 100.0% |
| `razon_social` | 100.0% | 100.0% |
| `tipo_documento` | 100.0% | 95.0% |
| `numero_identificacion` | 100.0% | 95.0% |
| `primer_apellido` | 100.0% | 95.0% |
| `segundo_apellido` | 100.0% | 95.0% |
| `primer_nombre` | 100.0% | 95.0% |
| `actividad_principal_codigo` | 85.0% | 100.0% |
| `actividad_secundaria_codigo` | 90.0% | 100.0% |
| `departamento` | 100.0% | 100.0% |
| `municipio` | 100.0% | 100.0% |
| `direccion` | 95.0% | 100.0% |
| `nombre_representante_legal` | 95.0% | 100.0% |

## Accuracy by variant

| Variant | Cases | `deepseek/deepseek-v4.1-flash` | `google/gemini-3.1-flash-lite-preview` |
| --- | ---: | ---: | ---: |
| clean | 8 | 99.2% | 95.8% |
| lowres | 3 | 86.7% | 100.0% |
| missing | 2 | 100.0% | 100.0% |
| rotated | 3 | 91.1% | 100.0% |
| scan | 4 | 100.0% | 100.0% |

## Output-only checks

Checks that need no golden (production could run them on every extraction).

| Model | DV mismatches | Non-CIIU activity codes | Missing required fields |
| --- | ---: | ---: | ---: |
| `deepseek/deepseek-v4.1-flash` | 4 | 3 | 1 |
| `google/gemini-3.1-flash-lite-preview` | 0 | 0 | 0 |

## Model availability

- `google/gemini-2.0-flash-001` (the route's former primary), probed once on 2026-09-27: **not listed** in `/api/v1/models`; the request failed (http, HTTP 404): `google/gemini-2.0-flash-001: HTTP 404 {"error":{"message":"No endpoints found for google/gemini-2.0-flash-001.","code":404}}`.
- Until 2026-09-27 it was the route's primary, so every production extraction failed once and was served by the fallback; the route now starts with the gated model.

## Failing case/field pairs

### `deepseek/deepseek-v4.1-flash` (11)

| Case | Field | Expected | Got |
| --- | --- | --- | --- |
| rut-06 | `actividad_principal_codigo` | `5611` | `20200918` |
| rut-13 | `nit` | `900987416` | `9009874116` |
| rut-13 | `actividad_principal_codigo` | `0125` | `01125` |
| rut-14 | `actividad_principal_codigo` | `7490` | `74900` |
| rut-14 | `direccion` | `CL 38 31 50 AP 301` | _null_ |
| rut-16 | `nit` | `1015478236` | `10151487836` |
| rut-16 | `actividad_secundaria_codigo` | _null_ | `2018` |
| rut-17 | `nit` | `901118594` | `901118954` |
| rut-17 | `actividad_secundaria_codigo` | `7410` | `2017` |
| rut-17 | `nombre_representante_legal` | `PEDRO NEL VILLAMIZAR ORTIZ` | `PEDRO VILLAMIZAR ORTIZ` |
| rut-18 | `nit` | `80456123` | `800456123` |

### `google/gemini-3.1-flash-lite-preview` (5)

| Case | Field | Expected | Got |
| --- | --- | --- | --- |
| rut-03 | `tipo_documento` | _null_ | `Cédula de Ciudadanía` |
| rut-03 | `numero_identificacion` | _null_ | `75089431` |
| rut-03 | `primer_apellido` | _null_ | `OSORIO` |
| rut-03 | `segundo_apellido` | _null_ | `VALENCIA` |
| rut-03 | `primer_nombre` | _null_ | `JUAN` |

## How to reproduce

```sh
pnpm eval:rut                                   # replay the recorded cassettes (no key needed)
OPENROUTER_API_KEY=... pnpm --filter frontend eval:rut:live   # re-record (budget US$2 by default)
python apps/frontend/evals/rut/dataset/build.py # regenerate the synthetic dataset (Typst + Pillow)
```

Scoring rules and thresholds: [docs/rut-evals.md](../../../../docs/rut-evals.md).
