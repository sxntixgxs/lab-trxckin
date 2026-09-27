"""Builds the synthetic RUT dataset used by the extraction evals.

Requirements: Python 3.10+, Pillow (`pip install pillow`) and the `typst` CLI (0.13+) on PATH
(or set TYPST=/path/to/typst).

    python apps/frontend/evals/rut/dataset/build.py

Reads entities.json (fictional taxpayers), renders each one with rut.typ to PDF and PNG, applies
the case's variant and writes cases/<id>/:

- document.{pdf|png|jpg}  what a user would upload; image-only models get page 1 of a PDF
                           rendered by lib/rut/pdf-image.ts, as in production
- expected.json            golden: the 15 fields exactly as the extractor should return them

Variants: clean (PDF), missing (PDF with optional fields left blank), scan (grey paper, noise,
blur, ±2° skew; JPEG or image-only PDF), rotated (90°, 180° or a few degrees), lowres (70-90 dpi).
Output is deterministic (fixed seeds); the generated files are checked in, so CI never runs this.
"""

from __future__ import annotations

import io
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases"
BASE_PPI = 150
FIXED_EPOCH = 1772355600  # 2026-03-01, pinned PDF metadata dates keep the output byte-stable
TYPST = os.environ.get("TYPST") or shutil.which("typst") or "typst"

PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

# Tax office printed in box 12 (a distractor: it names a city that may differ from box 40).
SECCIONAL = {
    "ANTIOQUIA": "Impuestos de Medellín",
    "BOGOTÁ D.C.": "Impuestos de Bogotá",
    "CUNDINAMARCA": "Impuestos de Bogotá",
    "CALDAS": "Impuestos de Manizales",
    "VALLE DEL CAUCA": "Impuestos de Cali",
    "ATLÁNTICO": "Impuestos de Barranquilla",
    "SANTANDER": "Impuestos de Bucaramanga",
    "RISARALDA": "Impuestos de Pereira",
    "BOLÍVAR": "Impuestos de Cartagena",
    "BOYACÁ": "Impuestos de Tunja",
    "QUINDÍO": "Impuestos de Armenia",
    "META": "Impuestos de Villavicencio",
    "TOLIMA": "Impuestos de Ibagué",
    "NORTE DE SANTANDER": "Impuestos de Cúcuta",
    "HUILA": "Impuestos de Neiva",
    "CASANARE": "Impuestos de Yopal",
}


def dv_nit(nit: str) -> str:
    """DIAN check digit (same algorithm as lib/rut/nit.ts)."""
    digitos = nit.lstrip("0")
    suma = sum(int(digitos[len(digitos) - 1 - i]) * PESOS_DIAN[i] for i in range(len(digitos)))
    residuo = suma % 11
    return str(11 - residuo if residuo > 1 else residuo)


def template_case(entity: dict, index: int) -> dict:
    """Entity as the template sees it: omitted fields blanked, plus deterministic filler."""
    case = json.loads(json.dumps(entity))
    for campo in case.get("omit", []):
        case[campo] = None
    case["seccional"] = SECCIONAL[case["departamento"]["nombre"]]
    case["fecha_generacion"] = f"2026-03-{(index % 27) + 1:02d} 10:{(index * 7) % 60:02d}:15"
    if case["tipo_contribuyente"] == "natural":
        case["fecha_expedicion"] = f"20{(index * 3) % 20:02d}{(index % 12) + 1:02d}{(index % 27) + 1:02d}"
    return case


def expected(entity: dict) -> dict:
    """Golden output: what a perfect extractor returns for this document."""
    omit = set(entity.get("omit", []))
    get = lambda k: None if k in omit else entity.get(k)  # noqa: E731
    sec = get("actividad_secundaria")
    rep = get("representante_legal")
    nombre_rep = None
    if rep:
        partes = [rep["primer_nombre"], rep.get("otros_nombres"), rep["primer_apellido"], rep.get("segundo_apellido")]
        nombre_rep = " ".join(p for p in partes if p)
    return {
        "nit": entity["nit"],
        "dv": entity["dv"],
        "tipo_contribuyente": entity["tipo_contribuyente"],
        "razon_social": get("razon_social"),
        "tipo_documento": get("tipo_documento"),
        "numero_identificacion": get("numero_identificacion"),
        "primer_apellido": get("primer_apellido"),
        "segundo_apellido": get("segundo_apellido"),
        "primer_nombre": get("primer_nombre"),
        "actividad_principal_codigo": entity["actividad_principal"]["codigo"],
        "actividad_secundaria_codigo": sec["codigo"] if sec else None,
        "departamento": entity["departamento"]["nombre"],
        "municipio": entity["municipio"]["nombre"],
        "direccion": get("direccion"),
        "nombre_representante_legal": nombre_rep,
        "variant": entity["variant"],
    }


def typst(case: dict, out: Path, ppi: int | None = None) -> None:
    cmd = [TYPST, "compile", str(HERE / "rut.typ"), str(out), "--input", "case=" + json.dumps(case)]
    cmd += ["--creation-timestamp", str(FIXED_EPOCH)]
    if ppi:
        cmd += ["--ppi", str(ppi)]
    subprocess.run(cmd, check=True)


def save_png(img: Image.Image, path: Path, colors: int = 32) -> None:
    """Palette/grey PNG keeps rendered pages small without visible loss."""
    if img.mode == "RGB":
        img = img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(path, "PNG", optimize=True)


def jpeg_roundtrip(img: Image.Image, quality: int) -> tuple[bytes, Image.Image]:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True)
    data = buf.getvalue()
    return data, Image.open(io.BytesIO(data)).convert(img.mode)


def scanned(img: Image.Image, rng: random.Random, skew: float) -> Image.Image:
    """Grey paper, speckles, grain, slight blur and skew: a cheap office scanner."""
    gris = ImageOps.grayscale(img)
    gris = gris.point(lambda v: int(38 + v * 0.83))  # paper ~ 250 → 245 grey, ink lifted
    w, h = gris.size
    grano = Image.frombytes("L", (w, h), rng.randbytes(w * h)).filter(ImageFilter.GaussianBlur(0.6))
    gris = Image.blend(gris, grano, 0.10)
    motas = gris.load()
    for _ in range(w * h // 900):
        x, y = rng.randrange(w), rng.randrange(h)
        motas[x, y] = rng.randrange(40, 140)
    gris = gris.filter(ImageFilter.GaussianBlur(0.7))
    return gris.rotate(skew, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=236)


def write_image_document(img: Image.Image, dest: Path, fmt: str, quality: int = 60) -> Image.Image:
    """Writes document.<fmt> and returns the pixels a reader of that file sees."""
    if fmt == "png":
        save_png(img, dest / "document.png", colors=64)
        return Image.open(dest / "document.png").convert("L" if img.mode == "L" else "RGB")
    data, decoded = jpeg_roundtrip(img, quality)
    if fmt == "jpg":
        (dest / "document.jpg").write_bytes(data)
    else:  # image-only PDF, like a scanner's output
        fecha = time.gmtime(FIXED_EPOCH)
        decoded.save(dest / "document.pdf", "PDF", resolution=float(BASE_PPI), quality=quality, creationDate=fecha, modDate=fecha)
    return decoded


def build_case(entity: dict, index: int, tmp: Path) -> None:
    dest = CASES / entity["id"]
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    case = template_case(entity, index)
    variant, opts = entity["variant"], entity.get("variant_options", {})
    rng = random.Random(opts.get("seed", index + 1))

    pdf, png = tmp / f"{entity['id']}.pdf", tmp / f"{entity['id']}.png"
    typst(case, pdf)
    typst(case, png, ppi=BASE_PPI)
    page = Image.open(png).convert("RGB")

    if variant in ("clean", "missing"):
        shutil.copyfile(pdf, dest / "document.pdf")
    elif variant == "scan":
        degraded = scanned(page, rng, skew=rng.choice([-1, 1]) * rng.uniform(0.6, 2.0))
        write_image_document(degraded, dest, opts["format"])
    elif variant == "rotated":
        angle = opts["angle"]
        if angle in (90, 180, 270):
            turned = page.rotate(angle, expand=True)
        else:
            turned = page.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(255, 255, 255))
        write_image_document(turned, dest, opts["format"], quality=70)
    elif variant == "lowres":
        scale = opts["dpi"] / BASE_PPI
        small = page.resize((round(page.width * scale), round(page.height * scale)), Image.Resampling.LANCZOS)
        write_image_document(small, dest, opts["format"], quality=75)
    else:
        raise ValueError(f"{entity['id']}: variante desconocida {variant}")

    (dest / "expected.json").write_text(json.dumps(expected(entity), ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    entities = json.loads((HERE / "entities.json").read_text(encoding="utf-8"))["cases"]
    for entity in entities:
        if dv_nit(entity["nit"]) != entity["dv"]:
            raise SystemExit(f"{entity['id']}: DV {entity['dv']} no corresponde al NIT {entity['nit']}")
    with tempfile.TemporaryDirectory() as tmp:
        for index, entity in enumerate(entities):
            build_case(entity, index, Path(tmp))
            print(f"{entity['id']:8} {entity['variant']:8} ok")
    total = sum(f.stat().st_size for f in CASES.rglob("*") if f.is_file())
    print(f"{len(entities)} casos, {total / 1024 / 1024:.1f} MB en {CASES}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
