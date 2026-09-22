"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import Signature, { type SignatureRef } from "@uiw/react-signature";

export type SignaturePadHandle = {
  /** PNG data URL of the drawn signature, or null when the pad is empty. */
  toPngDataUrl: () => Promise<string | null>;
  clear: () => void;
};

async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const svgStr = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth || 480;
      canvas.height = svg.clientHeight || 200;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Free-hand signature pad (mouse/touch) exported as PNG for the form PDF. */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(function SignaturePad({ height = 200 }, ref) {
  const sigRef = useRef<SignatureRef>(null);

  useImperativeHandle(ref, () => ({
    toPngDataUrl: async () => {
      const svg = sigRef.current?.svg;
      if (!svg) return null;
      // An untouched pad has no path children.
      if (svg.querySelectorAll("path").length === 0) return null;
      return await svgToPng(svg);
    },
    clear: () => sigRef.current?.clear(),
  }));

  return (
    <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
      <Signature ref={sigRef} style={{ width: "100%", height, display: "block" }} options={{ size: 4, thinning: 0.6, smoothing: 0.5 }} />
    </div>
  );
});
