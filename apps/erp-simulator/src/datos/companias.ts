export type CompaniaSimulada = {
  /** SIESA Cloud `idCompania`: the connection/tenant the company lives in. */
  idInstancia: string;
  /** Company inside the instance (`f010_id` / `f200_id_cia`). */
  cia: number;
  razonSocial: string;
  nit: string;
  /**
   * Documentation only: the app empresa mapped to this (instance, cia) pair. The backend owns
   * that mapping (apps/backend/src/erp/erp.config.ts); the fake ERP never reads this field.
   */
  appEmpresa: number;
};

/** Fictional instance ids; the app's companies are spread over two SIESA instances. */
export const INSTANCIAS_SIMULADAS = ["5001", "5002"] as const;

export const COMPANIAS_SIMULADAS: readonly CompaniaSimulada[] = [
  { idInstancia: "5001", cia: 1, razonSocial: "Andes Logística S.A.S.", nit: "900000001", appEmpresa: 1 },
  { idInstancia: "5002", cia: 1, razonSocial: "Cordillera Minería S.A.S.", nit: "900000002", appEmpresa: 2 },
  { idInstancia: "5001", cia: 7, razonSocial: "Pacífico Ingeniería S.A.S.", nit: "900000003", appEmpresa: 3 },
  { idInstancia: "5001", cia: 13, razonSocial: "Altiplano Holding S.A.S.", nit: "900000004", appEmpresa: 4 },
];

export function companiaDeAppEmpresa(appEmpresa: number): CompaniaSimulada {
  const compania = COMPANIAS_SIMULADAS.find((c) => c.appEmpresa === appEmpresa);
  if (!compania) throw new Error(`No hay compañía simulada para la empresa ${appEmpresa}.`);
  return compania;
}
