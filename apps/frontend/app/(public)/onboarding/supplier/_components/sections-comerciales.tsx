"use client";

import { BadgeCheck, Landmark, Plus, Star, Trash2, Users, Wallet } from "lucide-react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIPO_DOCUMENTO_OPTIONS } from "@/lib/onboarding/risk/shared";
import { defaultContacto, defaultReferencia, FORMA_PAGO_VALUES, PLAZO_CREDITO_VALUES } from "./form-schema";
import { AddButton, FieldGroup, INPUT, INPUT_WHITE, LABEL, Section, SectionHeader, type SupplierForm } from "./form-ui";

type Props = { form: SupplierForm; register: (index: number, el: HTMLElement | null) => void };

function SimpleInput({ form, name, label, type = "text", placeholder, white }: { form: SupplierForm; name: Parameters<SupplierForm["register"]>[0]; label: string; type?: string; placeholder?: string; white?: boolean }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={LABEL}>{label}</FormLabel>
          <FormControl>
            <Input type={type} placeholder={placeholder} className={white ? INPUT_WHITE : INPUT} {...field} value={(field.value as string | number | undefined) ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 06 — Contactos adicionales */
export function SeccionContactos({ form, register }: Props) {
  const contactos = form.watch("contactos_09") ?? [];
  return (
    <Section index={5} register={register}>
      <SectionHeader step="06" title="Contactos adicionales" icon={Users} description="Agregue las personas de contacto para distintas áreas." />
      <div className="space-y-2">
        {contactos.map((c, idx) => (
          <div key={idx} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600">{c.nombre ? c.nombre.charAt(0) : (idx + 1).toString()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{c.nombre || <span className="font-normal italic text-slate-400">Sin nombre</span>}</p>
                <p className="truncate text-xs text-slate-400">{[c.area, c.cargo].filter(Boolean).join(" · ") || "Sin área / cargo"}</p>
              </div>
              <button type="button" onClick={() => form.setValue("contactos_09", contactos.filter((_, i) => i !== idx))} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
              <SimpleInput form={form} name={`contactos_09.${idx}.nombre`} label="Nombre" white />
              <SimpleInput form={form} name={`contactos_09.${idx}.area`} label="Área" white />
              <SimpleInput form={form} name={`contactos_09.${idx}.cargo`} label="Cargo" white />
              <SimpleInput form={form} name={`contactos_09.${idx}.email`} label="Email" type="email" white />
              <SimpleInput form={form} name={`contactos_09.${idx}.celular`} label="Celular" white />
            </div>
          </div>
        ))}
        <AddButton onClick={() => form.setValue("contactos_09", [...contactos, { ...defaultContacto }])}>
          <Plus className="h-4 w-4" />
          Agregar otro contacto
        </AddButton>
      </div>
    </Section>
  );
}

/** 07 — Información bancaria */
export function SeccionBancaria({ form, register }: Props) {
  return (
    <Section index={6} register={register}>
      <SectionHeader step="07" title="Información bancaria" icon={Landmark} />
      <div className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="infoBancaria_10.tipoCuenta"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Tipo de cuenta</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "Ahorros"}>
                  <FormControl>
                    <SelectTrigger className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Ahorros">Ahorros</SelectItem>
                    <SelectItem value="Corriente">Corriente</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <SimpleInput form={form} name="infoBancaria_10.entidad" label="Entidad bancaria" />
          <SimpleInput form={form} name="infoBancaria_10.numeroCuenta" label="Número de cuenta" />
          <SimpleInput form={form} name="infoBancaria_10.titular" label="Titular" />
          <FormField
            control={form.control}
            name="infoBancaria_10.tipoDocumento"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={LABEL}>Tipo doc. titular</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "NIT"}>
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
          <SimpleInput form={form} name="infoBancaria_10.numeroDocumento" label="Número doc. titular" />
        </FieldGroup>
        <SimpleInput form={form} name="infoBancaria_10.email" label="Email del titular" type="email" />
      </div>
    </Section>
  );
}

/** 08 — Referencias comerciales */
export function SeccionReferencias({ form, register }: Props) {
  const referencias = form.watch("referenciasComerciales_11") ?? [];
  return (
    <Section index={7} register={register}>
      <SectionHeader step="08" title="Referencias comerciales" icon={Star} description="Incluya al menos dos referencias de empresas con las que haya trabajado." />
      <div className="space-y-2">
        {referencias.map((ref, idx) => (
          <div key={idx} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600">{ref.nombre ? ref.nombre.charAt(0) : (idx + 1).toString()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{ref.nombre || <span className="font-normal italic text-slate-400">Sin nombre</span>}</p>
                <p className="truncate text-xs text-slate-400">{[ref.ciudad, ref.personaContacto].filter(Boolean).join(" · ") || "Sin ciudad / contacto"}</p>
              </div>
              <button
                type="button"
                onClick={() => form.setValue("referenciasComerciales_11", referencias.filter((_, i) => i !== idx))}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
              <SimpleInput form={form} name={`referenciasComerciales_11.${idx}.nombre`} label="Empresa" white />
              <SimpleInput form={form} name={`referenciasComerciales_11.${idx}.ciudad`} label="Ciudad" white />
              <SimpleInput form={form} name={`referenciasComerciales_11.${idx}.telefono`} label="Teléfono" white />
              <SimpleInput form={form} name={`referenciasComerciales_11.${idx}.personaContacto`} label="Persona de contacto" white />
              <SimpleInput form={form} name={`referenciasComerciales_11.${idx}.tiempoProveedor`} label="Tiempo como proveedor" placeholder="Ej: 2 años" white />
            </div>
          </div>
        ))}
        <AddButton onClick={() => form.setValue("referenciasComerciales_11", [...referencias, { ...defaultReferencia }])}>
          <Plus className="h-4 w-4" />
          Agregar otra referencia
        </AddButton>
      </div>
    </Section>
  );
}

/** 09 — Condiciones de pago */
export function SeccionCondicionesPago({ form, register }: Props) {
  const forma = form.watch("condicionesPago_12.formaPago");
  return (
    <Section index={8} register={register}>
      <SectionHeader step="09" title="Condiciones de pago" icon={Wallet} description="Forma y plazo de pago acordados para la relación comercial." />
      <FieldGroup>
        <FormField
          control={form.control}
          name="condicionesPago_12.formaPago"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL}>Forma de pago</FormLabel>
              <Select
                onValueChange={(v) => {
                  field.onChange(v);
                  if (v === "Contado") form.setValue("condicionesPago_12.plazo", "NA", { shouldDirty: true });
                  else if (v === "Crédito") {
                    const p = form.getValues("condicionesPago_12.plazo");
                    if (p === "NA" || !p) form.setValue("condicionesPago_12.plazo", "30 días", { shouldDirty: true });
                  }
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className={INPUT}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {FORMA_PAGO_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
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
          name="condicionesPago_12.plazo"
          render={({ field }) => {
            const opciones: string[] = forma === "Contado" ? ["NA"] : [...PLAZO_CREDITO_VALUES];
            const value = forma === "Contado" ? "NA" : (PLAZO_CREDITO_VALUES as readonly string[]).includes(field.value ?? "") ? field.value : "30 días";
            return (
              <FormItem>
                <FormLabel className={LABEL}>Plazo</FormLabel>
                <Select onValueChange={field.onChange} value={value} disabled={forma === "Contado"}>
                  <FormControl>
                    <SelectTrigger className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {opciones.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v === "NA" ? "N/A (no aplica)" : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {forma === "Contado" && <p className="text-xs text-slate-500">Con pago de contado el plazo es N/A.</p>}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </FieldGroup>
    </Section>
  );
}

/** 10 — Información adicional */
export function SeccionAdicionales({ form, register }: Props) {
  return (
    <Section index={9} register={register}>
      <SectionHeader step="10" title="Información adicional" icon={BadgeCheck} />
      <div className="space-y-4">
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
