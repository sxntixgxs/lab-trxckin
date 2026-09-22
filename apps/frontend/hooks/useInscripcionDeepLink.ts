"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { DEEP_LINK_PARAMS, readDeepLinkParam } from "@/lib/command-palette/record-links";

/** How long to wait for the row to show up (the palette may be switching companies). */
const NOT_FOUND_GRACE_MS = 4000;

/**
 * Opens an onboarding inscription linked from the command palette
 * (`?inscripcion=<id>`) once it appears in the loaded rows, then drops the param.
 */
export function useInscripcionDeepLink<TId extends string>(
  rows: ReadonlyArray<{ _id: TId }> | undefined,
  openDetail: (id: TId) => void,
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { value, rest } = readDeepLinkParam(searchParams, DEEP_LINK_PARAMS.inscripcion);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!value || rows === undefined) return;
    const clear = () => {
      const qs = rest.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    const row = rows.find((r) => r._id === value);
    if (row) {
      pendingRef.current = null;
      openDetail(row._id);
      clear();
      return;
    }
    pendingRef.current = value;
    const timer = setTimeout(() => {
      if (pendingRef.current !== value) return;
      pendingRef.current = null;
      toast.error("La inscripción no está visible con la empresa seleccionada.");
      clear();
    }, NOT_FOUND_GRACE_MS);
    return () => clearTimeout(timer);
    // `rest` derives from searchParams; `openDetail` is a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rows]);
}
