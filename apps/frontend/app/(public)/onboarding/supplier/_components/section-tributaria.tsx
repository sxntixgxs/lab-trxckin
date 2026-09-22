"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import { COLOMBIA_MUNICIPIOS_OPTIONS } from "@/lib/catalogs/colombia-municipios";
import type { FormBranding } from "@/lib/onboarding/branding";
import { SiNoSelect, SubHeading } from "../../_components/info-tributaria-ui";
import type { FormValues } from "./form-schema";
import { dateInputToEpoch, epochToDateInput, FieldGroup, INPUT, LABEL, Section, SectionHeader, type SupplierForm } from "./form-ui";

type Props = { form: SupplierForm; register: (index: number, el: HTMLElement | null) => void; branding: FormBranding };

function NumberField({ form, name, label, placeholder, hint }: { form: SupplierForm; name: Parameters<SupplierForm["register"]>[0]; label: string; placeholder?: string; hint?: string }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={LABEL}>{label}</FormLabel>
          <FormControl>
            <Input type="number" step="0.01" min={0} className={INPUT} placeholder={placeholder} {...field} value={(field.value as number | undefined) ?? ""} />
          </FormControl>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 04 — Información tributaria (conditional Colombian tax questionnaire). */
export function SeccionTributaria({ form, register, branding }: Props) {
  const tipoPersona = form.watch("datos_generales_01.tipoPersona");
  const codigoCiiu = form.watch("actividadPrincipal_02.codigoCiiu");
  const ciiuLabel = codigoCiiu ? CIIU_ACTIVIDAD[codigoCiiu] : undefined;
  const granContribuyente = form.watch("infoTributaria_04.impuestoRenta.granContribuyente");
  const autorretenedorRenta = form.watch("infoTributaria_04.impuestoRenta.autorretenedorRenta");
  const responsableIca = form.watch("infoTributaria_04.impuestoIndustriaYComercio.responsableImpuesto");
  const granContribuyenteBogota = form.watch("infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.es");
  const regimenSimple = form.watch("infoTributaria_04.impuestoRenta.regimenSimple");
  const aiu = form.watch("infoTributaria_04.aiu");
  const sujetoReteIca = form.watch("infoTributaria_04.sujetoReteIca.es");
  const autorretenedorIca = form.watch("infoTributaria_04.autorretenedorIca.es");
  const [muestraExtranjero, setMuestraExtranjero] = useState(() => Boolean(form.getValues("infoTributaria_04.actividadesEconomicasExtranjeras")));

  const setCalidadDesdeRegimenes = () => {
    const ir = form.getValues("infoTributaria_04.impuestoRenta");
    const calidad: FormValues["infoTributaria_04"]["impuestoRenta"] extends infer T ? (T extends { calidadContribuyente: infer C } ? C : never) : never = ir?.regimenSimple
      ? "RST"
      : ir?.regimenEspecial
        ? "ESPECIAL_SIN_ANIMO_LUCRO"
        : ir?.regimenOrdinario
          ? "ORDINARIO"
          : "NO_CONTRIBUYENTE";
    form.setValue("infoTributaria_04.impuestoRenta.calidadContribuyente", calidad);
  };

  const regimenRow = "flex items-center justify-between gap-4 px-4 py-3";

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
          <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoRenta.contribuyente" label="¿Es contribuyente?" />
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50">
            <SiNoSelect<FormValues>
              control={form.control}
              name="infoTributaria_04.impuestoRenta.regimenOrdinario"
              label="¿Régimen ordinario?"
              rowClassName={regimenRow}
              onAfterChange={(v) => {
                if (v) {
                  form.setValue("infoTributaria_04.impuestoRenta.regimenEspecial", false);
                  form.setValue("infoTributaria_04.impuestoRenta.regimenSimple", false);
                  form.setValue("infoTributaria_04.tarifaReteIvaRST", undefined);
                }
                setCalidadDesdeRegimenes();
              }}
            />
            <SiNoSelect<FormValues>
              control={form.control}
              name="infoTributaria_04.impuestoRenta.regimenEspecial"
              label="¿Régimen especial (entidades sin ánimo de lucro)?"
              rowClassName={regimenRow}
              onAfterChange={(v) => {
                if (v) {
                  form.setValue("infoTributaria_04.impuestoRenta.regimenOrdinario", false);
                  form.setValue("infoTributaria_04.impuestoRenta.regimenSimple", false);
                  form.setValue("infoTributaria_04.tarifaReteIvaRST", undefined);
                }
                setCalidadDesdeRegimenes();
              }}
            />
            <SiNoSelect<FormValues>
              control={form.control}
              name="infoTributaria_04.impuestoRenta.regimenSimple"
              label="¿Régimen simple de tributación (RST)?"
              rowClassName={regimenRow}
              onAfterChange={(v) => {
                if (v) {
                  form.setValue("infoTributaria_04.impuestoRenta.regimenOrdinario", false);
                  form.setValue("infoTributaria_04.impuestoRenta.regimenEspecial", false);
                } else {
                  form.setValue("infoTributaria_04.tarifaReteIvaRST", undefined);
                }
                setCalidadDesdeRegimenes();
              }}
            />
          </div>

          {regimenSimple ? (
            <NumberField form={form} name="infoTributaria_04.tarifaReteIvaRST" label="Tarifa Rte IVA aplicable (%) — bienes y/o servicios" placeholder="Ej: 2.4" hint="Requerido para quienes se acogen al Régimen Simple de Tributación (RST)." />
          ) : null}

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoRenta.granContribuyente"
            label="¿Es gran contribuyente DIAN?"
            onAfterChange={(v) => {
              if (!v) {
                form.setValue("infoTributaria_04.impuestoRenta.resolucion", "");
                form.setValue("infoTributaria_04.impuestoRenta.fechaResolucion", 0);
              }
            }}
          />
          {granContribuyente ? (
            <FieldGroup>
              <FormField
                control={form.control}
                name="infoTributaria_04.impuestoRenta.resolucion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Resolución (gran contribuyente DIAN)</FormLabel>
                    <FormControl>
                      <Input className={INPUT} placeholder="Número de resolución" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="infoTributaria_04.impuestoRenta.fechaResolucion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Fecha de resolución (gran contribuyente)</FormLabel>
                    <FormControl>
                      <Input type="date" className={INPUT} value={epochToDateInput(field.value)} onChange={(e) => field.onChange(dateInputToEpoch(e.target.value, 0))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldGroup>
          ) : null}

          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoRenta.autorretenedorRenta"
            label="¿Es autorretenedor DIAN?"
            onAfterChange={(v) => {
              if (v) form.setValue("infoTributaria_04.tarifaReteFuente", undefined);
              else form.setValue("infoTributaria_04.impuestoRenta.resolucionAutorretenedor", "");
            }}
          />
          {autorretenedorRenta ? (
            <FormField
              control={form.control}
              name="infoTributaria_04.impuestoRenta.resolucionAutorretenedor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}>Resolución (autorretenedor de renta)</FormLabel>
                  <FormControl>
                    <Input className={INPUT} placeholder="Número de resolución" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <NumberField form={form} name="infoTributaria_04.tarifaReteFuente" label="Tarifa de retención en la fuente (%)" placeholder="Ej: 3.5" hint="Aplica cuando no es autorretenedor DIAN." />
          )}

          {tipoPersona === "PERSONA_NATURAL" ? (
            <FormField
              control={form.control}
              name="infoTributaria_04.tipoReteFuenteIfPersonaNatural"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}>Persona natural — ¿Art. 383 del E.T. o tarifa general?</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className={INPUT}>
                        <SelectValue placeholder="Seleccione una opción" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ART_383">Se acoge al Art. 383 del E.T.</SelectItem>
                      <SelectItem value="TARIFA_GENERAL">Tarifa general</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoVentas.responsableIva" label="¿Responsable de IVA?" />
          <SiNoSelect<FormValues> control={form.control} name="infoTributaria_04.impuestoVentas.retencionIva" label="¿Practica retención de IVA?" />
        </div>

        <div className="space-y-3">
          <FormField
            control={form.control}
            name="infoTributaria_04.aiu"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <FormControl>
                  <Checkbox
                    checked={field.value !== undefined && field.value !== null}
                    onCheckedChange={(c) => {
                      if (c === true) {
                        field.onChange(0);
                      } else {
                        field.onChange(undefined);
                        form.setValue("infoTributaria_04.aiuA", undefined);
                        form.setValue("infoTributaria_04.aiuI", undefined);
                        form.setValue("infoTributaria_04.aiuU", undefined);
                      }
                    }}
                    className="border-slate-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                  />
                </FormControl>
                <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">¿Maneja AIU (Administración, Imprevistos, Utilidad)?</FormLabel>
              </FormItem>
            )}
          />
          {aiu !== undefined && aiu !== null ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField form={form} name="infoTributaria_04.aiuA" label="Administración — A (%)" />
              <NumberField form={form} name="infoTributaria_04.aiuI" label="Imprevistos — I (%)" />
              <NumberField form={form} name="infoTributaria_04.aiuU" label="Utilidad — U (%)" />
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <SubHeading>Industria y comercio (ICA)</SubHeading>
          <SiNoSelect<FormValues>
            control={form.control}
            name="infoTributaria_04.impuestoIndustriaYComercio.responsableImpuesto"
            label="¿Es responsable de industria y comercio?"
            onAfterChange={(v) => {
              if (v) form.setValue("infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota", { es: false, resolucion: "", fechaResolucion: 0 });
              else form.setValue("infoTributaria_04.impuestoIndustriaYComercio.municipiosIcaResponsable", []);
            }}
          />
          {responsableIca ? (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-white p-4">
              <FormField
                control={form.control}
                name="infoTributaria_04.impuestoIndustriaYComercio.municipiosIcaResponsable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Ciudad y/o municipio donde es responsable de ICA</FormLabel>
                    <FormControl>
                      <MultiSelect options={COLOMBIA_MUNICIPIOS_OPTIONS} selected={field.value ?? []} onChange={field.onChange} placeholder="Seleccione uno o varios municipios..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <SiNoSelect<FormValues>
                control={form.control}
                name="infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.es"
                label="¿Es gran contribuyente Bogotá (ICA)?"
                onAfterChange={(v) => {
                  if (!v) {
                    form.setValue("infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.resolucion", "");
                    form.setValue("infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.fechaResolucion", 0);
                  }
                }}
              />
              {granContribuyenteBogota ? (
                <FieldGroup>
                  <FormField
                    control={form.control}
                    name="infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.resolucion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LABEL}>Resolución (gran contribuyente Bogotá)</FormLabel>
                        <FormControl>
                          <Input className={INPUT} placeholder="Número de resolución" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="infoTributaria_04.impuestoIndustriaYComercio.granContribuyenteBogota.fechaResolucion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LABEL}>Fecha de resolución</FormLabel>
                        <FormControl>
                          <Input type="date" className={INPUT} value={epochToDateInput(field.value)} onChange={(e) => field.onChange(dateInputToEpoch(e.target.value, 0))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FieldGroup>
              ) : null}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <SiNoSelect<FormValues>
              control={form.control}
              name="infoTributaria_04.sujetoReteIca.es"
              label="¿Es sujeto de retención de ICA?"
              onAfterChange={(v) => {
                if (v) form.setValue("infoTributaria_04.autorretenedorIca", { es: false, municipios: [] });
                else {
                  form.setValue("infoTributaria_04.sujetoReteIca.municipios", []);
                  form.setValue("infoTributaria_04.sujetoReteIca.tarifa", undefined);
                }
              }}
            />
            {sujetoReteIca ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="infoTributaria_04.sujetoReteIca.municipios"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={LABEL}>Municipios (sujeto Rte ICA)</FormLabel>
                      <FormControl>
                        <MultiSelect options={COLOMBIA_MUNICIPIOS_OPTIONS} selected={field.value ?? []} onChange={field.onChange} placeholder="Seleccione uno o varios municipios..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <NumberField form={form} name="infoTributaria_04.sujetoReteIca.tarifa" label="Tarifa Rte ICA (%)" placeholder="Ej: 9.66" />
              </div>
            ) : (
              <div className="space-y-3">
                <SiNoSelect<FormValues>
                  control={form.control}
                  name="infoTributaria_04.autorretenedorIca.es"
                  label="¿Es autorretenedor de ICA?"
                  onAfterChange={(v) => {
                    if (!v) form.setValue("infoTributaria_04.autorretenedorIca.municipios", []);
                  }}
                />
                {autorretenedorIca ? (
                  <FormField
                    control={form.control}
                    name="infoTributaria_04.autorretenedorIca.municipios"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={LABEL}>Municipios (autorretenedor ICA)</FormLabel>
                        <FormControl>
                          <MultiSelect options={COLOMBIA_MUNICIPIOS_OPTIONS} selected={field.value ?? []} onChange={field.onChange} placeholder="Seleccione uno o varios municipios..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Información adicional</p>
          <FormField
            control={form.control}
            name="infoTributaria_04.origenFondos"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Origen de fondos</FormLabel>
                <FormControl>
                  <Input className={INPUT} placeholder="Ej: Actividad económica lícita, Herencia, Donación..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="infoTributaria_04.actividadesEconomicasExtranjeras"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <FormLabel className={LABEL}>¿Realiza actividades económicas, operaciones financieras o posee bienes en moneda extranjera?</FormLabel>
                <Checkbox
                  checked={muestraExtranjero}
                  onCheckedChange={(c) => {
                    const on = c === true;
                    setMuestraExtranjero(on);
                    if (!on) field.onChange("");
                  }}
                  className="border-slate-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                />
                <FormControl>
                  <Input className={INPUT} type="text" disabled={!muestraExtranjero} placeholder="Ej: Panamá, Argentina, etc." {...field} value={field.value ?? ""} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>
    </Section>
  );
}
