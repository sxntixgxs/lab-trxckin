"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppProvider } from "@/providers/app-provider";

interface SidebarLinkProps {
  children: React.ReactNode;
  href: string;
  target?: string;
  nombre: string;
  exact?: boolean;
  /**
   * Indicador opcional a la derecha del enlace. Se renderiza fuera del viewport
   * del marquee a propósito: el command palette lee el texto del enlace para
   * armar su índice y no debe tragarse el contador.
   */
  badge?: React.ReactNode;
}

function getNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join(" ");
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

export default function SidebarLink({
  children,
  href,
  target,
  nombre,
  exact,
  badge,
}: SidebarLinkProps) {
  const pathname = usePathname();
  const { setSidebarOpen } = useAppProvider();

  const viewportRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  const label = getNodeText(children).trim();

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const measure = () => {
      setOverflow(Math.max(0, content.scrollWidth - viewport.clientWidth));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [label]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isOverflowing = overflow > 1;
  const scrolling = hovered && isOverflowing && !reduceMotion;
  // ~28px/s reveal speed, acotado entre 1.2s y 8s
  const scrollDuration = Math.min(8, Math.max(1.2, overflow / 28));

  const contentStyle: React.CSSProperties = {
    transform: scrolling ? `translateX(-${overflow}px)` : "translateX(0)",
    transitionProperty: "transform",
    transitionTimingFunction: scrolling ? "linear" : "ease-out",
    transitionDuration: scrolling ? `${scrollDuration}s` : "0.35s",
    willChange: scrolling ? "transform" : "auto",
  };

  const maskStyle: React.CSSProperties | undefined =
    isOverflowing && !hovered
      ? {
          maskImage: "linear-gradient(to right, #000 82%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, #000 82%, transparent)",
        }
      : undefined;

  // Solo se pasa a flex cuando hay badge, para que los enlaces sin indicador
  // conserven exactamente el layout que ya tenían.
  const conBadge = badge != null;

  return (
    <Link
      className={`
        group/link relative ${conBadge ? "flex items-center gap-2" : "block"} py-1.5 px-1.5 rounded-lg
        transition-colors duration-200 ease-out motion-reduce:transition-none
        ${
          isActive
            ? "sidebar-active-link text-white font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
        }
      `}
      href={href}
      data-nav-id={nombre}
      onClick={() => setSidebarOpen(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      target={target}
      title={label || undefined}
    >
      {isActive && (
        <span
          className="sidebar-active-marker absolute left-0 top-1/2 z-10 -translate-y-1/2 w-[3px] h-5 rounded-full"
          aria-hidden="true"
        />
      )}
      <span
        ref={viewportRef}
        className={`block overflow-hidden ${conBadge ? "flex-1 min-w-0" : ""}`}
        style={maskStyle}
      >
        <span
          ref={contentRef}
          className="inline-block ml-2 whitespace-nowrap align-middle motion-reduce:transition-none"
          style={contentStyle}
        >
          {children}
        </span>
      </span>
      {badge}
    </Link>
  );
}
