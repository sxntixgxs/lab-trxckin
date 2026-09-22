"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

/** Yes/No select bound to a boolean field. */
export function SiNoSelect<T extends FieldValues>({
  control,
  name,
  label,
  rowClassName,
  onAfterChange,
  disabled,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  rowClassName?: string;
  onAfterChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3", disabled && "opacity-60", rowClassName)}>
          <FormLabel className={cn("text-sm font-normal text-slate-700", disabled && "cursor-not-allowed")}>{label}</FormLabel>
          <Select
            value={field.value === true ? "si" : field.value === false ? "no" : ""}
            onValueChange={(v) => {
              if (disabled) return;
              const on = v === "si";
              field.onChange(on);
              onAfterChange?.(on);
            }}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className={cn("w-24 border-slate-200 bg-white", disabled && "cursor-not-allowed")}>
                <SelectValue placeholder="—" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="si">Sí</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  );
}
