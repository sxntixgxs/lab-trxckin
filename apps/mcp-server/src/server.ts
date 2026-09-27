import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { LabData } from "./lab-data.js";

const INSTRUCTIONS = `Read-only access to Lab Trxckin, a finance back-office demo (Colombian companies, fictional data).
- Invoices ("facturas") move through approval phases (recepción, líder, causación, contabilidad, gerencia, tesorería). SLAs are measured in Colombian business days (weekends and holidays excluded).
- Advances ("anticipos") are paid to employees and later settled ("legalizados") against invoices.
- This server can only read the companies it was configured for; read lab://companies to see them. It cannot approve, edit or delete anything.
Money amounts are in the invoice currency (usually COP) without formatting.`;

/** Tools never mutate data, touch only this app, and are safe to retry. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const companyId = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Company id from lab://companies. Optional when the server can read a single company.");

function ok(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

/**
 * A short message the agent can act on. Convex wraps server errors as
 * "[Request ID: …] Server Error\nUncaught Error: <message>\n    at …"; keep only <message>.
 */
export function mensajeDeError(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  const convex = /Uncaught (?:Error: )?(.+)/.exec(texto);
  const mensaje = (convex?.[1] ?? texto).split("\n")[0].trim();
  return mensaje || "Unexpected error";
}

async function ejecutar(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: mensajeDeError(error) }] };
  }
}

export function crearServidor(data: LabData, ahora: () => number = Date.now): McpServer {
  const server = new McpServer({ name: "lab-trxckin", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerResource(
    "companies",
    "lab://companies",
    {
      title: "Companies in scope",
      description: "The companies this server may read (id, legal name, NIT).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await data.empresas()) }],
    })
  );

  server.registerTool(
    "get_invoice_status",
    {
      title: "Invoice status",
      description:
        "Where an invoice is in the approval workflow: current phase, who owns it, and its SLA (business days in phase, days left, due date). Look it up by invoiceId, or by invoiceNumber (optionally with supplierNit when numbers repeat across suppliers). Returns at most 5 matches.",
      inputSchema: {
        invoiceId: z.string().min(1).max(64).optional().describe("Invoice id returned by another tool."),
        invoiceNumber: z.string().min(1).max(60).optional().describe('Invoice number as printed, e.g. "DRM-1041".'),
        supplierNit: z.string().min(5).max(20).optional().describe("Supplier NIT, with or without dots or check digit."),
        companyId,
      },
      annotations: { title: "Invoice status", ...READ_ONLY },
    },
    async ({ invoiceId, invoiceNumber, supplierNit, companyId }) => {
      if (!invoiceId && !invoiceNumber) {
        return { isError: true, content: [{ type: "text", text: "Pass invoiceId or invoiceNumber." }] };
      }
      return ejecutar(() =>
        data.estadoFactura({
          nowMs: ahora(),
          facturaId: invoiceId,
          numeroFactura: invoiceNumber,
          proveedorNit: supplierNit,
          empresa: companyId,
        })
      );
    }
  );

  server.registerTool(
    "list_pending_approvals",
    {
      title: "Pending approvals",
      description:
        "Invoices waiting for approval in one company, the ones that have been longest in their current phase first, with owners and SLA. Filter by assignee (email or part of the name) and/or supplier (part of the name or NIT).",
      inputSchema: {
        companyId,
        assignee: z.string().min(2).max(120).optional().describe("Owner email, or part of the owner's name."),
        supplier: z.string().min(2).max(120).optional().describe('Part of the supplier name or NIT, e.g. "Drominc".'),
        limit: z.number().int().min(1).max(25).optional().describe("Maximum invoices to return (default 10)."),
      },
      annotations: { title: "Pending approvals", ...READ_ONLY },
    },
    async ({ companyId, assignee, supplier, limit }) =>
      ejecutar(() =>
        data.aprobacionesPendientes({
          nowMs: ahora(),
          empresa: companyId,
          responsable: assignee,
          proveedor: supplier,
          limit,
        })
      )
  );

  server.registerTool(
    "get_advance_balance",
    {
      title: "Advance balance",
      description:
        "Balance of employee advances (anticipos): amount requested, settled against invoices, pending, phase, and whether the settlement deadline has passed. Look up by advanceId, by advanceNumber (consecutivo), or all advances of a requester by email.",
      inputSchema: {
        advanceId: z.string().min(1).max(64).optional(),
        advanceNumber: z.number().int().positive().optional().describe("Advance consecutive number."),
        requesterEmail: z.email().max(200).optional().describe("Email of the employee who requested the advances."),
        companyId,
      },
      annotations: { title: "Advance balance", ...READ_ONLY },
    },
    async ({ advanceId, advanceNumber, requesterEmail, companyId }) => {
      if (!advanceId && advanceNumber === undefined && !requesterEmail) {
        return {
          isError: true,
          content: [{ type: "text", text: "Pass advanceId, advanceNumber or requesterEmail." }],
        };
      }
      return ejecutar(() =>
        data.saldoAnticipos({
          nowMs: ahora(),
          empresa: companyId,
          anticipoId: advanceId,
          consecutivo: advanceNumber,
          solicitanteEmail: requesterEmail,
        })
      );
    }
  );

  const buscarProveedores = data.buscarProveedores;
  if (buscarProveedores) {
    server.registerTool(
      "search_suppliers",
      {
        title: "Search suppliers",
        description:
          "Active suppliers in the company's ERP catalog (synced from SIESA), matched by name or NIT. Returns NIT (without check digit), legal name and branch.",
        inputSchema: {
          query: z.string().trim().min(2).max(100).describe("Part of the supplier name, or at least 3 digits of its NIT."),
          companyId,
          limit: z.number().int().min(1).max(25).optional().describe("Maximum suppliers to return (default 10)."),
        },
        annotations: { title: "Search suppliers", ...READ_ONLY },
      },
      async ({ query, companyId, limit }) =>
        ejecutar(async () => {
          let empresa = companyId;
          if (empresa === undefined) {
            const empresas = await data.empresas();
            if (empresas.length !== 1) {
              throw new Error(`Pass companyId: ${empresas.map((e) => e.id).join(", ") || "none in scope"}.`);
            }
            empresa = empresas[0].id;
          }
          return buscarProveedores({ empresa, q: query, limit: limit ?? 10 });
        })
    );
  }

  return server;
}
