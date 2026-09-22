import React from "react";
import { cn } from "@/lib/utils";

interface DashboardHeroProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  gradientClassName?: string;
  iconWrapperClassName?: string;
  actions?: React.ReactNode;
}

export function DashboardHero({
  title,
  description,
  icon,
  className,
  gradientClassName,
  iconWrapperClassName,
  actions,
}: DashboardHeroProps) {
  return (
    <div
      className={cn(
        "dashboard-hero relative overflow-hidden rounded-2xl px-4 py-3.5 shadow-md md:px-5 md:py-4 md:shadow-lg",
        gradientClassName,
        className,
      )}
    >
      <div className="dashboard-hero-sheen pointer-events-none absolute inset-0" />
      <div className="dashboard-hero-glow-primary pointer-events-none absolute -top-16 right-0 h-48 w-48 translate-x-1/4 rounded-full blur-3xl" />
      <div className="dashboard-hero-glow-secondary pointer-events-none absolute -bottom-20 left-1/4 h-40 w-40 rounded-full blur-3xl" />
      <div className="dashboard-hero-accent-line pointer-events-none absolute inset-x-4 top-0 h-px md:inset-x-5" />

      <div className="relative z-10 flex items-center gap-3 text-white md:gap-4">
        <div
          className={cn(
            "dashboard-hero-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 shadow-inner ring-1 ring-white/15 backdrop-blur-xl md:h-12 md:w-12",
            iconWrapperClassName,
          )}
        >
          <div className="scale-[0.65] md:scale-75">{icon}</div>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="dashboard-hero-title text-lg font-semibold leading-tight md:text-2xl">{title}</h1>
          <p className="dashboard-hero-description mt-0.5 text-xs leading-snug text-slate-300 md:text-sm">
            {description}
          </p>
        </div>

        {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
