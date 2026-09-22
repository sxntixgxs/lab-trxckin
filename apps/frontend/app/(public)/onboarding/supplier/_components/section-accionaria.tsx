"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Share2, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIPO_DOCUMENTO_OPTIONS } from "@/lib/onboarding/risk/shared";
import { cn } from "@/lib/utils";
import { defaultAccionista, defaultFideicomiso } from "./form-schema";
import { AddButton, dateInputToEpoch, epochToDateInput, INPUT_WHITE, LABEL, Section, SectionHeader, type SupplierForm } from "./form-ui";

type Props = { form: SupplierForm; register: (index: number, el: HTMLElement | null) => void };

/** 05 — Composición accionaria y beneficiario final (con bloque PEP por accionista). */
export function SeccionAccionaria({ form, register }: Props) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const accionistas = form.watch("compoAccionaria_05") ?? [];
  const tipoPersona = form.watch("datos_generales_01.tipoPersona");

  return (
    <Section index={4} register={register}>
      <SectionHeader step="05" title="Composición accionaria y beneficiario final" icon={Share2} description="Información de accionistas y personas expuestas políticamente (PEP)." />
      <div className="space-y-3">
        {accionistas.map((acc, idx) => {
          const isOpen = expanded === idx;
          const esPep = form.watch(`compoAccionaria_05.${idx}.esPep`);
          const fideicomisos = form.watch(`compoAccionaria_05.${idx}.isPep.fideicomisos`) ?? [];
          return (
            <div key={idx} className={cn("overflow-hidden rounded-xl border transition-all", isOpen ? "border-slate-300 shadow-xs" : "border-slate-200")}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isOpen ? null : idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded(isOpen ? null : idx);
                  }
                }}
                className="flex w-full cursor-pointer select-none items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{acc.nombre || <span className="font-normal italic text-slate-400">Sin nombre</span>}</span>
                    {Number(acc.porcentajeParticipacion) > 0 && (
                      <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{acc.porcentajeParticipacion}%</span>
                    )}
                    {acc.esPep && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">PEP</span>}
                  </div>
                  {(acc.tipoDocumento || acc.numeroDocumento) && <p className="mt-0.5 text-xs text-slate-400">{[acc.tipoDocumento, acc.numeroDocumento].filter(Boolean).join(" ")}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      form.setValue("compoAccionaria_05", accionistas.filter((_, i) => i !== idx));
                      setExpanded(expanded === idx ? null : expanded !== null && expanded > idx ? expanded - 1 : expanded);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="rounded-lg p-1.5 text-slate-400">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-5 border-t border-slate-100 bg-slate-50/50 px-4 pb-5 pt-4">
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Identificación</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`compoAccionaria_05.${idx}.nombre`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Nombre completo</FormLabel>
                            <FormControl>
                              <Input className={INPUT_WHITE} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`compoAccionaria_05.${idx}.nacionalidad`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Nacionalidad</FormLabel>
                            <FormControl>
                              <Input className={INPUT_WHITE} placeholder="Ej: Colombiana" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`compoAccionaria_05.${idx}.tipoDocumento`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Tipo documento</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className={INPUT_WHITE}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIPO_DOCUMENTO_OPTIONS.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`compoAccionaria_05.${idx}.numeroDocumento`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={LABEL}>Número documento</FormLabel>
                            <FormControl>
                              <Input className={INPUT_WHITE} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Participación accionaria</p>
                    <FormField
                      control={form.control}
                      name={`compoAccionaria_05.${idx}.porcentajeParticipacion`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={LABEL}>Porcentaje (%)</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input type="number" min={0} max={100} className={`${INPUT_WHITE} w-28`} {...field} />
                              <span className="text-sm text-slate-400">de participación</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <FormField
                      control={form.control}
                      name={`compoAccionaria_05.${idx}.ifNatural.isAccionista`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 px-4 py-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} className="border-slate-300" />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">
                            {tipoPersona === "PERSONA_NATURAL" ? "¿Es accionista de una empresa o ejerce algún control sobre esta (como directivo o administrador)?" : "¿Es accionista de otra empresa?"}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    {form.watch(`compoAccionaria_05.${idx}.ifNatural.isAccionista`) && (
                      <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`compoAccionaria_05.${idx}.ifNatural.nombreEmpresa`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL}>Nombre empresa</FormLabel>
                              <FormControl>
                                <Input className={INPUT_WHITE} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`compoAccionaria_05.${idx}.ifNatural.nitEmpresa`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL}>NIT empresa</FormLabel>
                              <FormControl>
                                <Input className={INPUT_WHITE} {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>

                  <div className={cn("overflow-hidden rounded-lg border transition-colors", esPep ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white")}>
                    <FormField
                      control={form.control}
                      name={`compoAccionaria_05.${idx}.esPep`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 px-4 py-3">
                          <FormControl>
                            <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} className={cn("border-slate-300", field.value && "border-amber-400 data-[state=checked]:bg-amber-500")} />
                          </FormControl>
                          <div className="flex-1">
                            <FormLabel className="cursor-pointer text-sm font-medium text-slate-700">¿Es Persona Expuesta Políticamente (PEP)?</FormLabel>
                            <p className="mt-0.5 text-[11px] text-slate-400">Funcionarios públicos de alto nivel o personas vinculadas a ellos</p>
                          </div>
                          {field.value && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">PEP</span>}
                        </FormItem>
                      )}
                    />
                    {esPep && (
                      <div className="space-y-3 border-t border-amber-100 px-4 py-4">
                        <FormField
                          control={form.control}
                          name={`compoAccionaria_05.${idx}.isPep.ejerceActualmente`}
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-3 rounded-lg border border-amber-100 bg-white px-4 py-3">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} className="border-amber-300" />
                              </FormControl>
                              <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">¿Actualmente ejerce como PEP?</FormLabel>
                            </FormItem>
                          )}
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <FormField
                            control={form.control}
                            name={`compoAccionaria_05.${idx}.isPep.cargo`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={LABEL}>Cargo</FormLabel>
                                <FormControl>
                                  <Input className={INPUT_WHITE} placeholder="Ej: Congresista" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`compoAccionaria_05.${idx}.isPep.fechaInicio`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={LABEL}>Fecha inicio</FormLabel>
                                <FormControl>
                                  <Input type="date" className={INPUT_WHITE} value={epochToDateInput(field.value)} onChange={(e) => field.onChange(dateInputToEpoch(e.target.value, 0))} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`compoAccionaria_05.${idx}.isPep.fechaFin`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={LABEL}>Fecha fin</FormLabel>
                                <FormControl>
                                  <Input type="date" className={INPUT_WHITE} value={epochToDateInput(field.value)} onChange={(e) => field.onChange(dateInputToEpoch(e.target.value, undefined))} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name={`compoAccionaria_05.${idx}.isPep.dataCercanos`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={LABEL}>
                                Ingrese los nombres y números de identificación de cónyuge o compañeros permanentes; familiares hasta segundo grado de consanguinidad, segundo grado de afinidad y asociados cercanos
                              </FormLabel>
                              <FormControl>
                                <Textarea className={INPUT_WHITE} placeholder="Ej: Cónyuge, hijos, padres" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`compoAccionaria_05.${idx}.isPep.cuentasExtranjero`}
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-3 rounded-lg border border-amber-100 bg-white px-4 py-3">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} className="border-amber-300" />
                              </FormControl>
                              <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">
                                ¿Existen cuentas financieras en algún país extranjero sobre la que tenga derecho, poder de firma o de otra índole?
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                        <div className="mt-3 space-y-2">
                          <p className={LABEL}>
                            En caso de que usted, como PEP, sea fideicomitente de patrimonios autónomos o fideicomisos que administren recursos públicos, proporcione su nombre e identificación
                          </p>
                          {fideicomisos.map((_, fidx) => (
                            <div key={fidx} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-white p-3">
                              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                                <FormField
                                  control={form.control}
                                  name={`compoAccionaria_05.${idx}.isPep.fideicomisos.${fidx}.nombre`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className={LABEL}>Nombre</FormLabel>
                                      <FormControl>
                                        <Input className={INPUT_WHITE} placeholder="Nombre completo" {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`compoAccionaria_05.${idx}.isPep.fideicomisos.${fidx}.tipoDocumento`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className={LABEL}>Tipo documento</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger className={INPUT_WHITE}>
                                            <SelectValue placeholder="Tipo" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {TIPO_DOCUMENTO_OPTIONS.map((v) => (
                                            <SelectItem key={v} value={v}>
                                              {v}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`compoAccionaria_05.${idx}.isPep.fideicomisos.${fidx}.numeroDocumento`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className={LABEL}>Número documento</FormLabel>
                                      <FormControl>
                                        <Input className={INPUT_WHITE} placeholder="Número" {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => form.setValue(`compoAccionaria_05.${idx}.isPep.fideicomisos`, fideicomisos.filter((_, i) => i !== fidx))}
                                className="mt-8 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => form.setValue(`compoAccionaria_05.${idx}.isPep.fideicomisos`, [...fideicomisos, defaultFideicomiso()])}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 py-2.5 text-sm font-medium text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                          >
                            <Plus className="h-4 w-4" /> Agregar fideicomiso
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <AddButton
          onClick={() => {
            const arr = [...accionistas, defaultAccionista()];
            form.setValue("compoAccionaria_05", arr);
            setExpanded(arr.length - 1);
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar otro accionista / beneficiario
        </AddButton>
      </div>
    </Section>
  );
}
