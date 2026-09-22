/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as anticiposDashboard from "../anticiposDashboard.js";
import type * as cajaMenorBandejaQueries from "../cajaMenorBandejaQueries.js";
import type * as cajasMenores from "../cajasMenores.js";
import type * as centrosCosto from "../centrosCosto.js";
import type * as crons from "../crons.js";
import type * as facturacionAdjuntos from "../facturacionAdjuntos.js";
import type * as facturacionCausacion from "../facturacionCausacion.js";
import type * as facturacionConfiguracion from "../facturacionConfiguracion.js";
import type * as facturacionCorreos from "../facturacionCorreos.js";
import type * as facturacionCrucesDocumentosInternos from "../facturacionCrucesDocumentosInternos.js";
import type * as facturacionDashboard from "../facturacionDashboard.js";
import type * as facturacionFacturas from "../facturacionFacturas.js";
import type * as facturacionGraph from "../facturacionGraph.js";
import type * as facturacionNotaCreditoRelacion from "../facturacionNotaCreditoRelacion.js";
import type * as facturacionPeajesContabilidad from "../facturacionPeajesContabilidad.js";
import type * as facturacionProveedores from "../facturacionProveedores.js";
import type * as facturacionReportes from "../facturacionReportes.js";
import type * as facturacionSla from "../facturacionSla.js";
import type * as facturacionStorage from "../facturacionStorage.js";
import type * as facturacionSync from "../facturacionSync.js";
import type * as facturacionTareas from "../facturacionTareas.js";
import type * as financiero_anticipos from "../financiero/anticipos.js";
import type * as financiero_anticiposAjustes from "../financiero/anticiposAjustes.js";
import type * as lib_ajustarAnticiposPorBaseCruce from "../lib/ajustarAnticiposPorBaseCruce.js";
import type * as lib_anticiposDashboardProjection from "../lib/anticiposDashboardProjection.js";
import type * as lib_anticiposLegalizacionReconciliacion from "../lib/anticiposLegalizacionReconciliacion.js";
import type * as lib_anticiposNotifications from "../lib/anticiposNotifications.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_backgroundJobs from "../lib/backgroundJobs.js";
import type * as lib_billingAuth from "../lib/billingAuth.js";
import type * as lib_bolsasAnticipos from "../lib/bolsasAnticipos.js";
import type * as lib_cajaMenorAuditoria from "../lib/cajaMenorAuditoria.js";
import type * as lib_cajaMenorBandeja from "../lib/cajaMenorBandeja.js";
import type * as lib_cajaMenorFacturacionAdapter from "../lib/cajaMenorFacturacionAdapter.js";
import type * as lib_cajaMenorProjection from "../lib/cajaMenorProjection.js";
import type * as lib_cajaMenorReembolsoPermisos from "../lib/cajaMenorReembolsoPermisos.js";
import type * as lib_centrosCostoDistribucion from "../lib/centrosCostoDistribucion.js";
import type * as lib_colombiaHolidays from "../lib/colombiaHolidays.js";
import type * as lib_convexOutboundUrl from "../lib/convexOutboundUrl.js";
import type * as lib_crucesDocumentosInternos from "../lib/crucesDocumentosInternos.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_facturacionAnticipoDueno from "../lib/facturacionAnticipoDueno.js";
import type * as lib_facturacionBusinessTime from "../lib/facturacionBusinessTime.js";
import type * as lib_facturacionCausacion from "../lib/facturacionCausacion.js";
import type * as lib_facturacionCausacionApply from "../lib/facturacionCausacionApply.js";
import type * as lib_facturacionDashboardProjection from "../lib/facturacionDashboardProjection.js";
import type * as lib_facturacionDevolucionRules from "../lib/facturacionDevolucionRules.js";
import type * as lib_facturacionDianXmlParser from "../lib/facturacionDianXmlParser.js";
import type * as lib_facturacionGraphDiagnostics from "../lib/facturacionGraphDiagnostics.js";
import type * as lib_facturacionGraphSync from "../lib/facturacionGraphSync.js";
import type * as lib_facturacionMicrosoftGraph from "../lib/facturacionMicrosoftGraph.js";
import type * as lib_facturacionOwnership from "../lib/facturacionOwnership.js";
import type * as lib_facturacionPeajesContabilidad from "../lib/facturacionPeajesContabilidad.js";
import type * as lib_facturacionReportState from "../lib/facturacionReportState.js";
import type * as lib_facturacionTiempos from "../lib/facturacionTiempos.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as lib_notaCreditoRelacion from "../lib/notaCreditoRelacion.js";
import type * as lib_peajes from "../lib/peajes.js";
import type * as lib_peajesCentroCosto from "../lib/peajesCentroCosto.js";
import type * as lib_proveedorNit from "../lib/proveedorNit.js";
import type * as lib_serverActor from "../lib/serverActor.js";
import type * as lib_sessionAuth from "../lib/sessionAuth.js";
import type * as lib_valorAPagar from "../lib/valorAPagar.js";
import type * as lib_valorContable from "../lib/valorContable.js";
import type * as lib_valorLegalizableAnticipo from "../lib/valorLegalizableAnticipo.js";
import type * as notificacionesAnticipos from "../notificacionesAnticipos.js";
import type * as notificacionesFacturacion from "../notificacionesFacturacion.js";
import type * as notificationHttp from "../notificationHttp.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  anticiposDashboard: typeof anticiposDashboard;
  cajaMenorBandejaQueries: typeof cajaMenorBandejaQueries;
  cajasMenores: typeof cajasMenores;
  centrosCosto: typeof centrosCosto;
  crons: typeof crons;
  facturacionAdjuntos: typeof facturacionAdjuntos;
  facturacionCausacion: typeof facturacionCausacion;
  facturacionConfiguracion: typeof facturacionConfiguracion;
  facturacionCorreos: typeof facturacionCorreos;
  facturacionCrucesDocumentosInternos: typeof facturacionCrucesDocumentosInternos;
  facturacionDashboard: typeof facturacionDashboard;
  facturacionFacturas: typeof facturacionFacturas;
  facturacionGraph: typeof facturacionGraph;
  facturacionNotaCreditoRelacion: typeof facturacionNotaCreditoRelacion;
  facturacionPeajesContabilidad: typeof facturacionPeajesContabilidad;
  facturacionProveedores: typeof facturacionProveedores;
  facturacionReportes: typeof facturacionReportes;
  facturacionSla: typeof facturacionSla;
  facturacionStorage: typeof facturacionStorage;
  facturacionSync: typeof facturacionSync;
  facturacionTareas: typeof facturacionTareas;
  "financiero/anticipos": typeof financiero_anticipos;
  "financiero/anticiposAjustes": typeof financiero_anticiposAjustes;
  "lib/ajustarAnticiposPorBaseCruce": typeof lib_ajustarAnticiposPorBaseCruce;
  "lib/anticiposDashboardProjection": typeof lib_anticiposDashboardProjection;
  "lib/anticiposLegalizacionReconciliacion": typeof lib_anticiposLegalizacionReconciliacion;
  "lib/anticiposNotifications": typeof lib_anticiposNotifications;
  "lib/auth": typeof lib_auth;
  "lib/backgroundJobs": typeof lib_backgroundJobs;
  "lib/billingAuth": typeof lib_billingAuth;
  "lib/bolsasAnticipos": typeof lib_bolsasAnticipos;
  "lib/cajaMenorAuditoria": typeof lib_cajaMenorAuditoria;
  "lib/cajaMenorBandeja": typeof lib_cajaMenorBandeja;
  "lib/cajaMenorFacturacionAdapter": typeof lib_cajaMenorFacturacionAdapter;
  "lib/cajaMenorProjection": typeof lib_cajaMenorProjection;
  "lib/cajaMenorReembolsoPermisos": typeof lib_cajaMenorReembolsoPermisos;
  "lib/centrosCostoDistribucion": typeof lib_centrosCostoDistribucion;
  "lib/colombiaHolidays": typeof lib_colombiaHolidays;
  "lib/convexOutboundUrl": typeof lib_convexOutboundUrl;
  "lib/crucesDocumentosInternos": typeof lib_crucesDocumentosInternos;
  "lib/env": typeof lib_env;
  "lib/facturacionAnticipoDueno": typeof lib_facturacionAnticipoDueno;
  "lib/facturacionBusinessTime": typeof lib_facturacionBusinessTime;
  "lib/facturacionCausacion": typeof lib_facturacionCausacion;
  "lib/facturacionCausacionApply": typeof lib_facturacionCausacionApply;
  "lib/facturacionDashboardProjection": typeof lib_facturacionDashboardProjection;
  "lib/facturacionDevolucionRules": typeof lib_facturacionDevolucionRules;
  "lib/facturacionDianXmlParser": typeof lib_facturacionDianXmlParser;
  "lib/facturacionGraphDiagnostics": typeof lib_facturacionGraphDiagnostics;
  "lib/facturacionGraphSync": typeof lib_facturacionGraphSync;
  "lib/facturacionMicrosoftGraph": typeof lib_facturacionMicrosoftGraph;
  "lib/facturacionOwnership": typeof lib_facturacionOwnership;
  "lib/facturacionPeajesContabilidad": typeof lib_facturacionPeajesContabilidad;
  "lib/facturacionReportState": typeof lib_facturacionReportState;
  "lib/facturacionTiempos": typeof lib_facturacionTiempos;
  "lib/money": typeof lib_money;
  "lib/normalize": typeof lib_normalize;
  "lib/notaCreditoRelacion": typeof lib_notaCreditoRelacion;
  "lib/peajes": typeof lib_peajes;
  "lib/peajesCentroCosto": typeof lib_peajesCentroCosto;
  "lib/proveedorNit": typeof lib_proveedorNit;
  "lib/serverActor": typeof lib_serverActor;
  "lib/sessionAuth": typeof lib_sessionAuth;
  "lib/valorAPagar": typeof lib_valorAPagar;
  "lib/valorContable": typeof lib_valorContable;
  "lib/valorLegalizableAnticipo": typeof lib_valorLegalizableAnticipo;
  notificacionesAnticipos: typeof notificacionesAnticipos;
  notificacionesFacturacion: typeof notificacionesFacturacion;
  notificationHttp: typeof notificationHttp;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  cajaMenorMovimientosDisponibles: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"cajaMenorMovimientosDisponibles">;
  cajaMenorReembolsosActivosCaja: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"cajaMenorReembolsosActivosCaja">;
  cajaMenorReembolsosActivosResponsable: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"cajaMenorReembolsosActivosResponsable">;
  cajaMenorReembolsosActivosCustodio: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"cajaMenorReembolsosActivosCustodio">;
};
