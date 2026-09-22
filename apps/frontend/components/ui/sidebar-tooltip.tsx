"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

interface SidebarTooltipProps {
  children: React.ReactNode;
  label: string;
  isCollapsed: boolean;
  side?: "right" | "top" | "bottom" | "left";
}

export function SidebarTooltip({
  children,
  label,
  isCollapsed,
  side = "right",
}: SidebarTooltipProps) {
  const trigger = (
    <div
      className={cn(
        "sidebar-item-trigger",
        isCollapsed
          ? "mx-auto flex h-10 w-10 items-center justify-center"
          : "w-full"
      )}
    >
      {children}
    </div>
  );

  if (!isCollapsed) {
    return trigger;
  }

  return (
    <TooltipPrimitive.Provider delayDuration={80}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={10}
            className={cn(
              "z-[100] rounded-lg px-3 py-1.5",
              "bg-[#0E1426] border border-white/[0.08]",
              "text-xs font-medium text-slate-200 tracking-wide",
              "shadow-xl shadow-black/30",
              "animate-in fade-in-0 zoom-in-95 duration-150",
              "data-[side=right]:slide-in-from-left-1"
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-[#0E1426]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
