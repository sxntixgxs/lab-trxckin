// Synthetic look-alike of page 1 of the DIAN RUT (Formulario 001), for extraction evals.
// It is NOT the official form: no DIAN logo, simplified layout, fictional data only.
// Rendered by build.py: typst compile rut.typ out.pdf --input case='<json>'

#let c = json(bytes(sys.inputs.at("case", default: "{}")))
#let val(x) = if x == none { "" } else if type(x) == content { x } else { str(x) }

#set page(paper: "us-letter", margin: (x: 1.1cm, top: 1cm, bottom: 1.2cm))
#set block(spacing: 0pt)
#set text(font: ("Arial", "Liberation Sans", "DejaVu Sans"), size: 7.5pt, lang: "es")

#let verde = rgb("#dfe9dc")
#let verde-osc = rgb("#3f6b47")
#let linea = 0.5pt + rgb("#50605a")

// Numbered box: tiny "N. Label" on top, value below.
#let campo(n, etiqueta, valor, alto: 24pt) = block(
  width: 100%, height: alto, inset: (x: 3pt, y: 2pt), stroke: linea, fill: white,
  stack(
    spacing: 3pt,
    text(size: 5.5pt, fill: rgb("#2f3b35"))[#if n != none [#n. ]#etiqueta],
    text(size: 8.5pt, weight: "medium", val(valor)),
  ),
)

// Value printed digit by digit in small boxes, like the NIT/DV/CIIU cells.
#let casillas(valor, n) = {
  let s = val(valor)
  let digitos = s.clusters()
  let relleno = if digitos.len() < n { range(n - digitos.len()).map(_ => "") } else { () }
  box(grid(
    columns: n * (10pt,),
    rows: 12pt,
    ..(relleno + digitos).map(d => box(width: 10pt, height: 12pt, stroke: 0.4pt + rgb("#50605a"), align(center + horizon, text(size: 8.5pt, d)))),
  ))
}

#let campo-casillas(n, etiqueta, valor, cuantas) = block(
  width: 100%, height: 30pt, inset: (x: 3pt, y: 2pt), stroke: linea,
  stack(spacing: 3pt, text(size: 5.5pt)[#n. #etiqueta], casillas(valor, cuantas)),
)

#let seccion(titulo) = block(
  width: 100%, inset: (x: 4pt, y: 2.5pt), fill: verde-osc, above: 3pt, below: 0pt,
  text(fill: white, weight: "bold", size: 7pt, upper(titulo)),
)

#let fila(cols, ..celdas) = grid(columns: cols, column-gutter: 0pt, ..celdas)

// ---------------------------------------------------------------- header
#grid(
  columns: (1.3fr, 3fr, 1fr),
  stroke: linea,
  inset: 5pt,
  align(center + horizon, text(size: 7pt, fill: rgb("#2f3b35"))[Dirección de Impuestos\ y Aduanas Nacionales\ (documento de prueba)]),
  align(center + horizon)[
    #text(size: 11pt, weight: "bold")[Formulario del Registro Único Tributario]\
    #text(size: 9pt)[Hoja 1]
  ],
  align(center + horizon, text(size: 20pt, weight: "bold", fill: verde-osc)[001]),
)
#v(2pt)
#fila((1fr, 1fr, 1.4fr),
  campo(2, "Concepto", "02 Actualización"),
  campo(4, "Número de formulario", c.at("numero_formulario", default: "")),
  campo(none, "Espacio reservado para la DIAN", ""),
)
#fila((2.1fr, 0.6fr, 2fr, 1fr),
  campo-casillas(5, "Número de Identificación Tributaria (NIT)", c.at("nit"), 11),
  campo-casillas(6, "DV", c.at("dv"), 1),
  block(width: 100%, height: 30pt, inset: (x: 3pt, y: 2pt), stroke: linea, stack(spacing: 3pt,
    text(size: 5.5pt)[12. Dirección seccional],
    text(size: 8.5pt, c.at("seccional", default: "")))),
  block(width: 100%, height: 30pt, inset: (x: 3pt, y: 2pt), stroke: linea, stack(spacing: 3pt,
    text(size: 5.5pt)[14. Buzón electrónico],
    text(size: 8.5pt, "")))
)

// ---------------------------------------------------------------- identificación
#seccion("Identificación")
#let juridica = c.at("tipo_contribuyente") == "juridica"
#let tipos-doc = ("13": "Cédula de Ciudadanía", "22": "Cédula de Extranjería", "41": "Pasaporte", "31": "NIT")
#let td = c.at("tipo_documento")
#fila((2.2fr, 0.35fr, 1.6fr, 0.35fr, 1.4fr, 0.9fr),
  campo(24, "Tipo de contribuyente", if juridica [Persona jurídica] else [Persona natural o sucesión ilíquida]),
  campo(none, "Cód.", if juridica { "1" } else { "2" }),
  campo(25, "Tipo de documento", if td == none { "" } else { tipos-doc.at(td, default: td) }),
  campo(none, "Cód.", td),
  campo(26, "Número de identificación", c.at("numero_identificacion")),
  campo(27, "Fecha expedición", c.at("fecha_expedicion", default: "")),
)
#fila((1fr, 1fr, 1fr, 1fr),
  campo(31, "Primer apellido", c.at("primer_apellido")),
  campo(32, "Segundo apellido", c.at("segundo_apellido")),
  campo(33, "Primer nombre", c.at("primer_nombre")),
  campo(34, "Otros nombres", c.at("otros_nombres")),
)
#fila((1fr,), campo(35, "Razón social", c.at("razon_social")))
#fila((3fr, 1fr),
  campo(36, "Nombre comercial", c.at("nombre_comercial")),
  campo(37, "Sigla", ""),
)

// ---------------------------------------------------------------- ubicación
#seccion("Ubicación")
#let dep = c.at("departamento")
#let mun = c.at("municipio")
#fila((1.4fr, 0.35fr, 2fr, 0.35fr, 2fr, 0.45fr),
  campo(38, "País", "COLOMBIA"),
  campo(none, "Cód.", "169"),
  campo(39, "Departamento", dep.nombre),
  campo(none, "Cód.", dep.codigo),
  campo(40, "Ciudad/Municipio", mun.nombre),
  campo(none, "Cód.", mun.codigo),
)
#fila((1fr,), campo(41, "Dirección principal", c.at("direccion")))
#fila((2.2fr, 0.8fr, 1fr, 1fr),
  campo(42, "Correo electrónico", c.at("correo")),
  campo(43, "Código postal", ""),
  campo(44, "Teléfono 1", c.at("telefono")),
  campo(45, "Teléfono 2", ""),
)

// ---------------------------------------------------------------- clasificación
#seccion("Clasificación — Actividad económica")
#let a1 = c.at("actividad_principal")
#let a2 = c.at("actividad_secundaria")
#fila((1fr, 1.1fr, 1fr, 1.1fr, 1.4fr, 0.8fr),
  campo-casillas(46, "Actividad principal — Código", a1.codigo, 4),
  campo-casillas(47, "Fecha inicio actividad", a1.fecha_inicio, 8),
  campo-casillas(48, "Actividad secundaria — Código", if a2 == none { none } else { a2.codigo }, 4),
  campo-casillas(49, "Fecha inicio actividad", if a2 == none { none } else { a2.fecha_inicio }, 8),
  block(width: 100%, height: 30pt, inset: (x: 3pt, y: 2pt), stroke: linea, stack(spacing: 3pt,
    text(size: 5.5pt)[50. Otras actividades — Código], grid(columns: 2, column-gutter: 4pt, casillas(none, 4), casillas(none, 4)))),
  campo-casillas(51, "Ocupación", none, 4),
)

// ---------------------------------------------------------------- responsabilidades
#seccion("Responsabilidades, calidades y atributos")
#let resp = if juridica {
  ("05 - Impto. renta y compl. régimen ordinario", "07 - Retención en la fuente a título de renta", "48 - Impuesto sobre las ventas - IVA", "52 - Facturador electrónico")
} else {
  ("05 - Impto. renta y compl. régimen ordinario", "49 - No responsable de IVA", "52 - Facturador electrónico")
}
#block(width: 100%, stroke: linea, inset: 3pt, grid(
  columns: (1fr, 1fr),
  row-gutter: 3pt,
  text(size: 5.5pt)[53. Código],
  [],
  ..resp.map(r => text(size: 7.5pt, r)),
))

// ---------------------------------------------------------------- representación
#seccion("Representación")
#let rep = c.at("representante_legal", default: none)
#let rv(k) = if rep == none { "" } else { rep.at(k) }
#fila((1.6fr, 1fr, 1.5fr, 1.5fr),
  campo(98, "Representación", if rep == none { "" } else { "REPRS LEGAL PRIN   18" }),
  campo(99, "Fecha inicio ejercicio", if rep == none { "" } else { "20240101" }),
  campo(100, "Tipo de documento", if rep == none { "" } else { "Cédula de Ciudadanía 13" }),
  campo(101, "Número de identificación", rv("numero_identificacion")),
)
#fila((1fr, 1fr, 1fr, 1fr),
  campo(104, "Primer apellido", rv("primer_apellido")),
  campo(105, "Segundo apellido", rv("segundo_apellido")),
  campo(106, "Primer nombre", rv("primer_nombre")),
  campo(107, "Otros nombres", rv("otros_nombres")),
)

// ---------------------------------------------------------------- firma
#v(4pt)
#grid(
  columns: (2fr, 1fr),
  stroke: linea,
  inset: 4pt,
  block(height: 42pt)[#text(size: 5.5pt)[Firma del solicitante:]],
  block(height: 42pt)[#text(size: 5.5pt)[Fecha generación documento PDF:]\ #text(size: 8pt, c.at("fecha_generacion", default: ""))],
)

#place(bottom + center, dy: 0.6cm, text(size: 5.5pt, fill: rgb("#9aa39e"))[Documento sintético — datos ficticios para pruebas])
