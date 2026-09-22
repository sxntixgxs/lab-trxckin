"use client";

import { Briefcase, Building2, GitBranch } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CIIU_ACTIVIDAD } from "@/lib/catalogs/ciiu";
import type { FormBranding } from "@/lib/onboarding/branding";
import { TIPO_DOCUMENTO_OPTIONS, TIPO_PERSONA_LABELS, TIPO_PERSONA_OPTIONS } from "@/lib/onboarding/risk/shared";
import { SubHeading } from "../../_components/info-tributaria-ui";
import { FieldGroup, INPUT, LABEL, Section, SectionHeader, type SupplierForm } from "./form-ui";

type Props = { form: SupplierForm; register: (index: number, el: HTMLElement | null) => void; branding: FormBranding };

function TextField({ form, name, label, type = "text", placeholder, inputMode }: { form: SupplierForm; name: Parameters<SupplierForm["register"]>[0]; label: string; type?: string; placeholder?: string; inputMode?: "tel" | "email" }) {
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

/** 01 — Datos generales */
export function SeccionDatosGenerales({ form, register }: Props) {
  const tipoPersona = form.watch("datos_generales_01.tipoPersona");
  return (
    <Section index={0} register={register}>
      <SectionHeader step="01" title="Datos generales" icon={Building2} description="Información principal del proveedor o contratista." />
      <div className="space-y-4">
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
        <TextField form={form} name="datos_generales_01.website" label="Sitio web" type="url" placeholder="https://..." />

        <SubHeading>Otros datos de contacto (empresa)</SubHeading>
        <FieldGroup>
          <TextField form={form} name="datos_generales_01.celular" label="Celular (empresa)" inputMode="tel" />
          <TextField form={form} name="datos_generales_01.email" label="Email (empresa)" type="email" />
        </FieldGroup>

        <SubHeading>Representante legal / firmante autorizado</SubHeading>
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
        </FieldGroup>
        <FieldGroup>
          <TextField form={form} name="datos_generales_01.representanteLegalTelefono" label="Teléfono" inputMode="tel" />
          <TextField form={form} name="datos_generales_01.representanteLegalCelular" label="Celular" inputMode="tel" />
          <TextField form={form} name="datos_generales_01.representanteLegalNacionalidad" label="Nacionalidad" />
          <TextField form={form} name="datos_generales_01.representanteLegalNombreContacto" label="Nombre de contacto" />
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

/** 02 — Actividad económica */
export function SeccionActividad({ form, register }: Props) {
  const codigoCiiu = form.watch("actividadPrincipal_02.codigoCiiu");
  return (
    <Section index={1} register={register}>
      <SectionHeader step="02" title="Actividad económica principal" icon={Briefcase} description="Clasifique su actividad con el código CIIU correspondiente." />
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="actividadPrincipal_02.codigoCiiu"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL}>Código CIIU</FormLabel>
              <FormControl>
                <Input className={INPUT} placeholder="Ej: 6201" {...field} />
              </FormControl>
              {codigoCiiu && CIIU_ACTIVIDAD[codigoCiiu] && <p className="mt-1.5 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">{CIIU_ACTIVIDAD[codigoCiiu]}</p>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="actividadPrincipal_02.actividadEconomica"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL}>Actividad económica (descripción)</FormLabel>
              <FormControl>
                <Textarea className={`${INPUT} min-h-[72px]`} placeholder="Opcional: detalle de la actividad según CIIU u otra referencia" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextField form={form} name="actividadPrincipal_02.descripcionServicio" label="Descripción del servicio" placeholder="Breve descripción" />
        <FieldGroup>
          <TextField form={form} name="actividadPrincipal_02.cuentasExtranjero" label="¿Tiene cuentas en el exterior?" placeholder="SÍ / NO y detalle si aplica" />
          <TextField form={form} name="actividadPrincipal_02.transaccionesVirtuales" label="¿Realiza transacciones con activos virtuales?" placeholder="SÍ / NO" />
        </FieldGroup>
      </div>
    </Section>
  );
}

const CONFLICTO_KEYS = [
  "representanteLegalXColaborador",
  "funcionariosExEmpresa",
  "gerentesXEmpresa",
  "sociosXProveedorEmpresa",
  "profesionalesVinculadosXEmpresa",
  "accionistasRelacionadosXEmpresa",
] as const;

/** 03 — Conflicto de intereses */
export function SeccionConflicto({ form, register, branding }: Props) {
  const empresa = branding.nombre;
  const labels = [
    `Los representantes legales de su organización tienen relación de parentesco con un colaborador de ${empresa} o que pertenezca a una organización que sea proveedor de ${empresa}`,
    `Alguno de los funcionarios de su compañía son ex-funcionarios de ${empresa}`,
    `Usted o los funcionarios de nivel gerencial en su organización tienen vínculos de parentesco, cónyuge o compañero permanente, hasta el tercer grado de consanguinidad, tercero de afinidad con algún colaborador de ${empresa}`,
    `Alguno de los socios o administradores de su organización es socio o administrador de otra empresa que preste servicios a ${empresa}`,
    `Existe algún profesional vinculado a su empresa que haya tenido vínculo laboral o comercial con ${empresa}`,
    `Existe alguna persona accionista, miembro de la gerencia, que ejerza un cargo de dirección, asesor o directivo o miembro de la junta directiva, de su organización que tenga relación con algún empleado de ${empresa}`,
  ];
  return (
    <Section index={2} register={register}>
      <SectionHeader step="03" title="Conflicto de intereses" icon={GitBranch} description="Indique si alguna de las siguientes situaciones aplica en su organización." />
      <div className="space-y-3">
        {CONFLICTO_KEYS.map((key, i) => (
          <FormField
            key={key}
            control={form.control}
            name={`conflictoIntereses_03.${key}`}
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5 border-slate-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary" />
                </FormControl>
                <FormLabel className="cursor-pointer text-sm font-normal text-slate-700">{labels[i]}</FormLabel>
              </FormItem>
            )}
          />
        ))}
      </div>
    </Section>
  );
}
