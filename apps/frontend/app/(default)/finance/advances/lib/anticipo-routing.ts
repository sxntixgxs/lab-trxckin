type AnticipoRoutingInput = {
  cubreFacturaCompleta?: boolean;
  tipoBolsa?: "general" | "peajes";
  responsableOrigen?: "jefe_directo" | "manual" | "solicitante";
};

export function anticipoCubreFacturaCompleta(anticipo: AnticipoRoutingInput) {
  if (anticipo.tipoBolsa === "peajes") return true;
  return anticipo.cubreFacturaCompleta !== false;
}

export function anticipoRequiereAprobacionJefe(anticipo: AnticipoRoutingInput) {
  return (
    anticipo.responsableOrigen === "jefe_directo" ||
    anticipo.responsableOrigen === "manual"
  );
}

export function getApplicableProgressPhases(anticipo: AnticipoRoutingInput) {
  const phases: string[] = ["I_SOLICITUD"];
  if (anticipoRequiereAprobacionJefe(anticipo)) {
    phases.push("II_APROBACION_JEFE_DIRECTO");
  }
  if (anticipoCubreFacturaCompleta(anticipo)) {
    phases.push("III_REVISION_CONTABILIDAD");
  }
  phases.push(
    "IV_APROBACION_GERENCIA",
    "IV_DESEMBOLSO_TESORERIA",
    "V_PENDIENTE_LEGALIZACION",
    "COMPLETADO"
  );
  return phases;
}

export function getCoberturaFacturaLabel(anticipo: AnticipoRoutingInput) {
  return anticipoCubreFacturaCompleta(anticipo) ? "100% factura" : "Parcial";
}

export function getRutaAprobacionResumen(anticipo: AnticipoRoutingInput) {
  const pasos: string[] = [];
  if (anticipoRequiereAprobacionJefe(anticipo)) {
    pasos.push("Aprobación jefe directo");
  }
  if (anticipoCubreFacturaCompleta(anticipo)) {
    pasos.push("Revisión Contabilidad");
  }
  pasos.push("Gerencia Financiera", "Desembolso tesorería");
  return pasos;
}

export function getSiguienteFaseLabel(anticipo: AnticipoRoutingInput) {
  if (anticipoRequiereAprobacionJefe(anticipo)) {
    return "Jefe directo";
  }
  if (anticipoCubreFacturaCompleta(anticipo)) {
    return "Revisión Contabilidad";
  }
  return "Gerencia Financiera";
}
