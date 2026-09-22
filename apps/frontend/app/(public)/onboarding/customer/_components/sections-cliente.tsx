"use client";

import { BadgeCheck, Building2, FileText } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { COLOMBIA_MUNICIPIOS_OPTIONS } from "@/lib/catalogs/colombia-municipios";
import type { FormBranding } from "@/lib/onboarding/branding";
import { TIPO_DOCUMENTO_OPTIONS, TIPO_PERSONA_LABELS, TIPO_PERSONA_OPTIONS } from "@/lib/onboarding/risk/shared";
import { cn } from "@/lib/utils";
import { SiNoSelect, SubHeading } from "../../_components/info-tributaria-ui";
import { FieldGroup, INPUT, LABEL, Section, SectionHeader } from "../../supplier/_components/form-ui";
import type { CustomerForm, FormValues, InscripcionPublica } from "./form-schema";

type Props = { form: CustomerForm; register: (index: number, el: HTMLElement | null) => void; branding: FormBranding };
type FieldName = Parameters<CustomerForm["register"]>[0];

function TextField({ form, name, label, type = "text", placeholder, inputMode }: { form: CustomerForm; name: FieldName; label: string; type?: string; placeholder?: string; inputMode?: "tel" | "email" }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={LABEL}>{label}</FormLabel>
          <FormControl>
            <Input type={type} inputMode={inputMode} placeholder={placeholder} className={INPUT} {...field} value={(field.value as string) ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 01 — Datos generales del cliente. */
export function SeccionDatosGenerales({ form, register, tipoSolicitud }: Props & { tipoSolicitud?: string }) {
  const tipoPersona = form.watch("datos_generales_01.tipoPersona");
  return (
    <Section index={0} register={register}>
      <SectionHeader step="01" title="Datos generales" icon={Building2} description="Información principal del cliente." />
      <div className="space-y-4">
        {tipoSolicitud && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Tipo de solicitud: <span className="font-semibold text-slate-800">{tipoSolicitud}</span>
          </div>
        )}
        <FieldGroup>
          <FormField
            control={form.control}
            name="datos_generales_01.tipoPersona"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Tipo de persona</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPO_PERSONA_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        Persona {TIPO_PERSONA_LABELS[opt]?.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextField form={form} name="datos_generales_01.razonSocial" label="Razón social / Nombre" />
        </FieldGroup>

        <SubHeading>Contacto principal</SubHeading>
        <FieldGroup className="sm:grid-cols-3">
          <TextField form={form} name="datos_generales_01.contactoNombre" label="Nombre" />
          <TextField form={form} name="datos_generales_01.contactoEmail" label="Email" type="email" />
          <TextField form={form} name="datos_generales_01.contactoCelular" label="Celular" inputMode="tel" />
        </FieldGroup>

        <SubHeading>Ubicación</SubHeading>
        <TextField form={form} name="datos_generales_01.direccion" label="Dirección" />
        <FieldGroup className="sm:grid-cols-3">
          <TextField form={form} name="datos_generales_01.ciudad" label="Ciudad" />
          <TextField form={form} name="datos_generales_01.departamento" label="Departamento" />
          <TextField form={form} name="datos_generales_01.telefono" label="Teléfono" inputMode="tel" />
        </FieldGroup>
        <TextField form={form} name="datos_generales_01.web" label="Sitio web" type="url" placeholder="https://..." />

        <SubHeading>Representante legal</SubHeading>
        <FieldGroup>
          <TextField form={form} name="datos_generales_01.representanteLegalNombre" label="Nombre *" />
          <FormField
            control={form.control}
            name="datos_generales_01.representanteLegalTipoDocumento"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Tipo de documento *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "C.C."}>
                  <FormControl>
                    <SelectTrigger className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPO_DOCUMENTO_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextField form={form} name="datos_generales_01.representanteLegalNumeroDocumento" label="Número documento *" />
          <TextField form={form} name="datos_generales_01.representanteLegalEmail" label="Email para firma *" type="email" />
          <TextField form={form} name="datos_generales_01.representanteLegalNacionalidad" label="Nacionalidad" />
        </FieldGroup>

        {tipoPersona === "PERSONA_JURIDICA" && (
          <>
            <SubHeading>Tesorero / Contador</SubHeading>
            <div className="space-y-6">
              <div>
                <p className={`mb-3 ${LABEL}`}>Tesorero</p>
                <FieldGroup className="sm:grid-cols-3">
                  <TextField form={form} name="datos_generales_01.tesoreroNombre" label="Nombre" />
                  <TextField form={form} name="datos_generales_01.tesoreroEmail" label="Email" type="email" />
                  <TextField form={form} name="datos_generales_01.tesoreroTelefono" label="Teléfono" inputMode="tel" />
                </FieldGroup>
              </div>
              <div>
                <p className={`mb-3 ${LABEL}`}>Contador</p>
                <FieldGroup className="sm:grid-cols-3">
                  <TextField form={form} name="datos_generales_01.contadorNombre" label="Nombre" />
                  <TextField form={form} name="datos_generales_01.contadorEmail" label="Email" type="email" />
                  <TextField form={form} name="datos_generales_01.contadorTelefono" label="Teléfono" inputMode="tel" />
                </FieldGroup>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

function TributariaText({ form, name, label, placeholder, type = "text" }: { form: CustomerForm; name: FieldName; label: string; placeholder?: string; type?: string }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={LABEL}>{label}</FormLabel>
          <FormControl>
            <Input type={type} className={INPUT} placeholder={placeholder} {...field} value={(field.value as string) ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 04 — Información tributaria del cliente (cuestionario condicional). */
export function SeccionTributaria({ form, register, branding }: Props) {
  const codigoCiiu = form.watch("actividadPrincipal_02.codigoCiiu");
  const ciiuLabel = codigoCiiu ? CIIU_ACTIVIDAD[codigoCiiu] : undefined;
  const contribuyente = form.watch("infoTributaria_04.impuestoRenta.contribuyente");
  const granContribuyente = form.watch("infoTributaria_04.impuestoRenta.granContribuyente");
  const autorretenedor = form.watch("infoTributaria_04.impuestoRenta.autorretenedorRenta");
  const responsableIca = form.watch("infoTributaria_04.impuestoIndustriaYComercio.responsableImpuesto");
  const granContribuyenteIcaBogota = form.watch("infoTributaria_04.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota");
  const practicaReteFuente = form.watch("infoTributaria_04.basesReteFuente.practicaReteFuente");
  const practicaReteIca = form.watch("infoTributaria_04.basesReteFuente.practicaReteIca");
  const regimenRow = "flex items-center justify-between gap-4 px-4 py-3";

  const setRegimen = (key: "regimenOrdinario" | "regimenEspecial" | "regimenSimple", calidad: FormValues["infoTributaria_04"]["impuestoRenta"]["calidadContribuyente"]) => (v: boolean) => {
    if (!v) return;
    for (const k of ["regimenOrdinario", "regimenEspecial", "regimenSimple"] as const) if (k !== key) form.setValue(`infoTributaria_04.impuestoRenta.${k}`, false);
    form.setValue("infoTributaria_04.impuestoRenta.contribuyente", true);
    form.setValue("infoTributaria_04.impuestoRenta.calidadContribuyente", calidad);
  };

  return (
    <Section index={3} register={register}>
      <SectionHeader step="04" title="Información tributaria" icon={FileText} />
      <div className="mb-6 space-y-2 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <p>Antes de diligenciar su información tributaria, tenga presente las calidades tributarias nacionales y territoriales de {branding.nombre}.</p>
        <p className="text-xs text-amber-900/90">
          <span className="font-semibold">Ejemplo de redacción (referencia):</span> No somos grandes contribuyentes DIAN. Somos autorretenedores DIAN. Somos responsables de ICA en varios
          municipios. Somos grandes contribuyentes ICA Bogotá.
        </p>
      </div>
      <div className="space-y-6">
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actividad económica (código CIIU)</p>
          <p className="text-sm text-slate-800">
            {codigoCiiu ? (
              <>
                <span className="font-mono font-semibold">{codigoCiiu}</span>
                {ciiuLabel ? <span className="text-slate-600"> — {ciiuLabel}</span> : null}
              </>
            ) : (
              <span className="italic text-slate-500">Defina el código CIIU en el paso «Actividad económica».</span>
            )}
          </p>
        </div>

        <div className="space-y-3">
          <SubHeading>Calidad del contribuyente</SubHeading>
          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoRenta.contribuyente"
            label="¿Es contribuyente?"
            onAfterChange={(v) => {
              if (!v) {
                form.setValue("infoTributaria_04.impuestoRenta.calidadContribuyente", "NO_CONTRIBUYENTE");
                for (const k of ["regimenOrdinario", "regimenEspecial", "regimenSimple"] as const) form.setValue(`infoTributaria_04.impuestoRenta.${k}`, false);
              }
            }}
          />
          <div className={cn("divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50", contribuyente === false && "opacity-60")}>
            <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoRenta.regimenOrdinario" label="¿Régimen ordinario?" rowClassName={regimenRow} disabled={contribuyente === false} onAfterChange={setRegimen("regimenOrdinario", "ORDINARIO")} />
            <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoRenta.regimenEspecial" label="¿Régimen especial (entidades sin ánimo de lucro)?" rowClassName={regimenRow} disabled={contribuyente === false} onAfterChange={setRegimen("regimenEspecial", "ESPECIAL_SIN_ANIMO_LUCRO")} />
            <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoRenta.regimenSimple" label="¿Régimen simple de tributación?" rowClassName={regimenRow} disabled={contribuyente === false} onAfterChange={setRegimen("regimenSimple", "RST")} />
          </div>

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoRenta.granContribuyente"
            label="¿Es gran contribuyente DIAN?"
            onAfterChange={(v) => {
              if (!v) {
                form.setValue("infoTributaria_04.impuestoRenta.resolucion", "");
                form.setValue("infoTributaria_04.impuestoVentas.tarifaRetencionIva", "");
              }
            }}
          />
          {granContribuyente ? (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-white p-4">
              <p className="text-xs text-slate-600">Indique resolución y tarifa de retención de IVA aplicable.</p>
              <FieldGroup>
                <TributariaText form={form} name="infoTributaria_04.impuestoRenta.resolucion" label="Resolución (gran contribuyente DIAN)" placeholder="Número de resolución" />
                <TributariaText form={form} name="infoTributaria_04.impuestoVentas.tarifaRetencionIva" label="Tarifa Rte IVA" placeholder="Ej: 15%" />
              </FieldGroup>
            </div>
          ) : null}

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoRenta.autorretenedorRenta"
            label="¿Es autorretenedor DIAN?"
            onAfterChange={(v) => {
              if (!v) form.setValue("infoTributaria_04.impuestoRenta.resolucionAutorretenedor", "");
            }}
          />
          {autorretenedor !== undefined ? (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-white p-4">
              <p className="text-xs text-slate-600">{autorretenedor ? "Indique resolución, tarifa y base de retención en la fuente." : "Indique tarifa y base de retención en la fuente."}</p>
              <FieldGroup>
                {autorretenedor ? <TributariaText form={form} name="infoTributaria_04.impuestoRenta.resolucionAutorretenedor" label="Resolución (autorretenedor DIAN)" placeholder="Número de resolución" /> : null}
                <TributariaText form={form} name="infoTributaria_04.impuestoRenta.tarifaRetencionFuente" label="Tarifa Rte Fte" placeholder="Tarifa aplicable" />
              </FieldGroup>
              <TributariaText form={form} name="infoTributaria_04.impuestoRenta.baseRetencionFuente" label="Indique base retención" placeholder="Base sobre la que aplica la retención" />
            </div>
          ) : null}

          <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoVentas.responsableIva" label="¿Responsable IVA?" />
          <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoVentas.retencionIva" label="¿Practica retención de IVA?" />
        </div>

        <div className="space-y-3">
          <SubHeading>Industria y Comercio</SubHeading>
          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoIndustriaYComercio.responsableImpuesto"
            label="¿Es responsable de industria y comercio?"
            onAfterChange={(v) => {
              if (!v) {
                form.setValue("infoTributaria_04.impuestoIndustriaYComercio.municipios", []);
                form.setValue("infoTributaria_04.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota", false);
                form.setValue("infoTributaria_04.impuestoIndustriaYComercio.resolucionGranContribuyenteIca", "");
              }
            }}
          />
          {responsableIca ? (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-white p-4">
              <FormField
                control={form.control}
                name="infoTributaria_04.impuestoIndustriaYComercio.municipios"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Indique ciudad y/o municipio</FormLabel>
                    <FormControl>
                      <MultiSelect options={COLOMBIA_MUNICIPIOS_OPTIONS} selected={field.value ?? []} onChange={field.onChange} placeholder="Seleccione uno o varios municipios..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SiNoSelect<FormValues>
                control={form.control}
                name="infoTributaria_04.impuestoIndustriaYComercio.esGranContribuyenteIcaBogota"
                label="¿Es gran contribuyente ICA Bogotá?"
                onAfterChange={(v) => {
                  if (!v) form.setValue("infoTributaria_04.impuestoIndustriaYComercio.resolucionGranContribuyenteIca", "");
                }}
              />
              {granContribuyenteIcaBogota ? <TributariaText form={form} name="infoTributaria_04.impuestoIndustriaYComercio.resolucionGranContribuyenteIca" label="Resolución (gran contribuyente ICA Bogotá)" placeholder="Número de resolución" /> : null}
            </div>
          ) : null}

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.basesReteFuente.practicaReteIca"
            label="¿Practica retención de ICA?"
            onAfterChange={(v) => {
              if (!v) {
                form.setValue("infoTributaria_04.basesReteFuente.municipiosRetIca", []);
                form.setValue("infoTributaria_04.basesReteFuente.tarifaRetencionIca", "");
                form.setValue("infoTributaria_04.basesReteFuente.whichBase", "");
              }
            }}
          />
          {practicaReteIca ? (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-white p-4">
              <FormField
                control={form.control}
                name="infoTributaria_04.basesReteFuente.municipiosRetIca"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Indique ciudad y/o municipio</FormLabel>
                    <FormControl>
                      <MultiSelect options={COLOMBIA_MUNICIPIOS_OPTIONS} selected={field.value ?? []} onChange={field.onChange} placeholder="Seleccione uno o varios municipios..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FieldGroup>
                <TributariaText form={form} name="infoTributaria_04.basesReteFuente.tarifaRetencionIca" label="Tarifa Rte ICA" placeholder="Tarifa aplicable" />
                <TributariaText form={form} name="infoTributaria_04.basesReteFuente.whichBase" label="Indique base retención" placeholder="Base sobre la que aplica la retención" />
              </FieldGroup>
            </div>
          ) : null}

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.basesReteFuente.practicaReteFuente"
            label="¿Practica retención en la fuente?"
            onAfterChange={(v) => {
              if (!v) form.setValue("infoTributaria_04.basesReteFuente.cualBase", "");
            }}
          />
          {practicaReteFuente ? <TributariaText form={form} name="infoTributaria_04.basesReteFuente.cualBase" label="Indique base retención en la fuente" placeholder="Base sobre la que aplica la retención" /> : null}
        </div>

        <div className="space-y-3">
          <SubHeading>Contactos</SubHeading>
          <FormField
            control={form.control}
            name="infoTributaria_04.correoFacturacionElectronica"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Indique correo único para facturación electrónica</FormLabel>
                <FormControl>
                  <Input type="email" className={INPUT} placeholder="correo@empresa.com" {...field} value={field.value ?? ""} />
                </FormControl>
                <p className="pl-1 text-xs italic text-amber-900/90">
                  *Si usted va a cambiar este correo, debe notificarlo al departamento contable para la correcta emisión de facturas. De lo contrario {branding.nombre} no aceptará rechazos o la no recepción de las facturas.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-3 rounded-lg border border-slate-100 bg-white p-4">
            <p className="text-xs font-medium text-slate-700">Indique contacto para emisión de certificados de retención</p>
            <TributariaText form={form} name="infoTributaria_04.contactoCertificadosRetencion.nombre" label="Contacto" placeholder="Nombre de la persona" />
            <FieldGroup>
              <TributariaText form={form} name="infoTributaria_04.contactoCertificadosRetencion.correo" label="Correo" placeholder="correo@empresa.com" type="email" />
              <TributariaText form={form} name="infoTributaria_04.contactoCertificadosRetencion.telefono" label="Teléfono" placeholder="Ej: +57 300 000 0000" />
            </FieldGroup>
          </div>
        </div>
      </div>
    </Section>
  );
}

function formatPago(value: string | undefined): string {
  if (!value?.trim()) return "Pendiente de definir";
  return value === "NA" ? "No aplica" : value;
}

/** 09 — Información adicional (condiciones de pago fijadas por el comercial + experiencia). */
export function SeccionAdicionales({ form, register, condicionesPago }: Omit<Props, "branding"> & { condicionesPago: InscripcionPublica["condicionesPago_12"] }) {
  return (
    <Section index={8} register={register}>
      <SectionHeader step="09" title="Información adicional" icon={BadgeCheck} />
      <div className="space-y-4">
        <SubHeading>Condiciones de pago</SubHeading>
        <p className="text-xs text-slate-500">Definidas por el área comercial al iniciar el proceso. Si tiene observaciones, contacte a su asesor.</p>
        <FieldGroup>
          <div>
            <p className={`mb-1.5 ${LABEL}`}>Forma de pago</p>
            <div className={cn("flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-slate-700", !condicionesPago?.formaPago && "text-slate-400")}>{formatPago(condicionesPago?.formaPago)}</div>
          </div>
          <div>
            <p className={`mb-1.5 ${LABEL}`}>Plazo</p>
            <div className={cn("flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-medium text-slate-700", !condicionesPago?.plazo && "text-slate-400")}>{formatPago(condicionesPago?.plazo)}</div>
          </div>
        </FieldGroup>
        <SubHeading>Experiencia y oferta</SubHeading>
        <FormField
          control={form.control}
          name="adicionales_13.aniosExperiencia"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL}>Años de experiencia</FormLabel>
              <FormControl>
                <Input type="number" min={0} className={`${INPUT} w-36`} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="adicionales_13.serviciosXGarantias"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL}>Servicios y garantías</FormLabel>
              <FormControl>
                <Textarea className={INPUT} placeholder="Descripción breve" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </Section>
  );
}
