"use node";

import { XMLParser } from "fast-xml-parser";

export interface DianInvoiceData {
  numeroFactura: string;
  clienteNit: string;
  cufe: string;
  tipoDocumento: string;
  referenciaDocumento: string;
  referenciaCufe: string;
  proveedorNit: string;
  proveedorNombre: string;
  proveedorDireccion: string;
  proveedorTelefono: string;
  proveedorEmail: string;
  fechaEmision: string;
  fechaVencimiento: string;
  subtotal: number;
  impuestos: number;
  total: number;
  moneda: string;
  descripcion: string;
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if ("#text" in objectValue) {
      return String(objectValue["#text"] ?? "");
    }
    return "";
  }
  return String(value);
}

function safeNumber(value: unknown): number {
  const raw = safeText(value).trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{1,2}(\D|$))/g, ".")
    .replace(/,(?=\d{3}(\D|$))/g, "");

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dig(source: unknown, ...keys: string[]): unknown {
  let current: unknown = source;

  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;

    const record = current as Record<string, unknown>;

    if (key in record) {
      current = record[key];
      continue;
    }

    current =
      record[`cbc:${key}`] ??
      record[`cac:${key}`] ??
      record[`fe:${key}`] ??
      record[`sts:${key}`] ??
      record[`ext:${key}`] ??
      record[`ds:${key}`];
  }

  return current;
}

function getFirstObject(value: unknown) {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function extractNitFromPartySource(source: unknown) {
  const party = dig(source, "Party") ?? source;
  const taxScheme = getFirstObject(
    dig(party, "PartyTaxScheme") ?? dig(party, "PartyIdentification")
  );
  const legalEntity = getFirstObject(dig(party, "PartyLegalEntity"));
  const partyIdentification = getFirstObject(dig(party, "PartyIdentification"));

  return (
    safeText(dig(taxScheme, "CompanyID")) ||
    safeText(dig(legalEntity, "CompanyID")) ||
    safeText(dig(partyIdentification, "ID")) ||
    safeText(dig(taxScheme, "ID"))
  );
}

function extractClienteNit(root: unknown) {
  const customer =
    dig(root, "AccountingCustomerParty") ??
    dig(root, "ReceiverParty") ??
    dig(root, "CustomerParty");

  return extractNitFromPartySource(customer);
}

function extractSupplierParty(root: unknown) {
  const supplier =
    dig(root, "AccountingSupplierParty") ??
    dig(root, "SenderParty") ??
    dig(root, "SupplierParty");

  const party = dig(supplier, "Party") ?? supplier;
  const taxScheme =
    dig(party, "PartyTaxScheme") ?? dig(party, "PartyIdentification");

  const nit =
    safeText(dig(taxScheme, "CompanyID")) ||
    safeText(dig(party, "PartyIdentification", "ID")) ||
    safeText(dig(taxScheme, "ID"));

  const nombre =
    safeText(dig(party, "PartyName", "Name")) ||
    safeText(dig(taxScheme, "RegistrationName")) ||
    safeText(dig(party, "PartyLegalEntity", "RegistrationName"));

  const address =
    dig(party, "PhysicalLocation", "Address") ??
    dig(party, "PostalAddress") ??
    dig(party, "Address");

  const direccion = [
    safeText(dig(address, "AddressLine", "Line")),
    safeText(dig(address, "CityName")),
    safeText(dig(address, "CountrySubentity")),
  ]
    .filter(Boolean)
    .join(", ");

  const contact = dig(party, "Contact");

  return {
    nit,
    nombre,
    direccion,
    telefono: safeText(dig(contact, "Telephone")),
    email:
      safeText(dig(contact, "ElectronicMail")) ||
      safeText(dig(party, "Contact", "ElectronicMail")),
  };
}

function extractInvoiceLines(root: unknown): DianInvoiceData["lineas"] {
  const rawLines =
    dig(root, "InvoiceLine") ??
    dig(root, "CreditNoteLine") ??
    dig(root, "DebitNoteLine");

  if (!rawLines) return [];

  const lines = Array.isArray(rawLines) ? rawLines : [rawLines];

  return lines.map((line) => {
    const item = dig(line, "Item");
    return {
      descripcion:
        safeText(dig(item, "Description")) ||
        safeText(dig(item, "Name")) ||
        "Sin descripcion",
      cantidad: safeNumber(
        dig(line, "InvoicedQuantity") ??
          dig(line, "CreditedQuantity") ??
          dig(line, "DebitedQuantity"),
      ),
      precioUnitario: safeNumber(dig(line, "Price", "PriceAmount")),
      total: safeNumber(dig(line, "LineExtensionAmount")),
    };
  });
}

function extractReferencedDocument(root: unknown) {
  const billingReference = getFirstObject(dig(root, "BillingReference"));
  const invoiceReference =
    dig(billingReference, "InvoiceDocumentReference") ??
    dig(billingReference, "CreditNoteDocumentReference") ??
    dig(billingReference, "DocumentReference");
  const discrepancyReference = getFirstObject(dig(root, "DiscrepancyResponse", "ReferenceID"));
  const documentReference =
    invoiceReference ?? getFirstObject(dig(root, "DocumentReference"));

  return {
    numero: safeText(dig(documentReference, "ID")) || safeText(discrepancyReference),
    cufe: safeText(dig(documentReference, "UUID")),
  };
}

function detectDocumentType(root: Record<string, unknown>) {
  if (root.Invoice || root["fe:Invoice"]) {
    return { type: "01", doc: root.Invoice ?? root["fe:Invoice"] };
  }

  if (root.CreditNote || root["fe:CreditNote"]) {
    return { type: "91", doc: root.CreditNote ?? root["fe:CreditNote"] };
  }

  if (root.DebitNote || root["fe:DebitNote"]) {
    return { type: "92", doc: root.DebitNote ?? root["fe:DebitNote"] };
  }

  const attached =
    root.AttachedDocument ?? root["ext:AttachedDocument"] ?? root["ar:SendBillAsync"];

  if (attached) {
    const embeddedXml = dig(
      attached,
      "Attachment",
      "ExternalReference",
      "Description",
    );

    if (typeof embeddedXml === "string") {
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          removeNSPrefix: false,
        });

        return detectDocumentType(parser.parse(embeddedXml));
      } catch {
        return { type: "01", doc: attached };
      }
    }

    return { type: "01", doc: attached };
  }

  const firstKey = Object.keys(root).find(
    (key) => !key.startsWith("?") && !key.startsWith("@"),
  );

  return { type: "01", doc: firstKey ? root[firstKey] : root };
}

export function parseDianXml(xmlContent: string): DianInvoiceData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseAttributeValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xmlContent) as Record<string, unknown>;
  const { type: tipoDocumento, doc } = detectDocumentType(parsed);

  const numeroFactura = safeText(dig(doc, "ID")) || "SIN-NUMERO";
  const clienteNit = extractClienteNit(doc);
  const referencedDocument = extractReferencedDocument(doc);
  const cufe =
    safeText(dig(doc, "UUID")) ||
    safeText(
      dig(
        doc,
        "UBLExtensions",
        "UBLExtension",
        "ExtensionContent",
        "DianExtensions",
        "InvoiceControl",
        "AuthorizationNumber",
      ),
    );

  const fechaEmision =
    safeText(dig(doc, "IssueDate")) || new Date().toISOString().split("T")[0];
  const fechaVencimiento =
    safeText(dig(dig(doc, "PaymentMeans"), "PaymentDueDate")) ||
    safeText(dig(doc, "DueDate"));
  const moneda = safeText(dig(doc, "DocumentCurrencyCode")) || "COP";

  const supplier = extractSupplierParty(doc);
  const legalTotal =
    dig(doc, "LegalMonetaryTotal") ?? dig(doc, "RequestedMonetaryTotal");

  const subtotal = safeNumber(
    dig(legalTotal, "LineExtensionAmount") ??
      dig(legalTotal, "TaxExclusiveAmount"),
  );
  const total = safeNumber(
    dig(legalTotal, "PayableAmount") ?? dig(legalTotal, "TaxInclusiveAmount"),
  );

  const rawTaxTotal = dig(doc, "TaxTotal");
  const taxTotals = Array.isArray(rawTaxTotal)
    ? rawTaxTotal
    : rawTaxTotal
      ? [rawTaxTotal]
      : [];

  const impuestos = taxTotals.reduce(
    (sum, tax) => sum + safeNumber(dig(tax, "TaxAmount")),
    0,
  );
  const lineas = extractInvoiceLines(doc);
  const descripcion =
    lineas.length > 0
      ? lineas.map((linea) => linea.descripcion).join(" | ")
      : safeText(dig(doc, "Note")) || "Factura electronica";

  return {
    numeroFactura,
    clienteNit,
    cufe,
    tipoDocumento,
    referenciaDocumento: referencedDocument.numero,
    referenciaCufe: referencedDocument.cufe,
    proveedorNit: supplier.nit,
    proveedorNombre: supplier.nombre,
    proveedorDireccion: supplier.direccion,
    proveedorTelefono: supplier.telefono,
    proveedorEmail: supplier.email,
    fechaEmision,
    fechaVencimiento,
    subtotal,
    impuestos,
    total,
    moneda,
    descripcion,
    lineas,
  };
}
