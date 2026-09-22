"use client";

import { Transition } from "@headlessui/react";
import { ChevronDown, PanelLeftClose, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { NAV_ITEMS } from "@/lib/nav";
import { useAppProvider } from "@/providers/app-provider";
import Logo from "./logo";
import SidebarLink from "./sidebar-link";
import SidebarLinkGroup from "./sidebar-link-group";
import { SidebarTooltip } from "./sidebar-tooltip";

const HOVER_COLLAPSE_DELAY_MS = 120;
const SIDEBAR_WIDTH_MS = 280;

export default function Sidebar() {
  const sidebar = useRef<HTMLDivElement>(null);
  const { sidebarOpen, setSidebarOpen, sidebarExpanded, setSidebarExpanded } = useAppProvider();
  const { hasAccessTo } = useCurrentUser();
  const [isDesktop, setIsDesktop] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  const effectiveExpanded =
    sidebarExpanded || sidebarOpen || (hoverExpanded && isDesktop && !sidebarOpen);
  const isCollapsed = !effectiveExpanded && !sidebarOpen && isDesktop;
  const isFloating = hoverExpanded && !sidebarExpanded && isDesktop;
  const showSidebar = sidebarOpen || isDesktop;

  const [isCollapsing, setIsCollapsing] = useState(false);
  const prevEffectiveExpanded = useRef(effectiveExpanded);

  useLayoutEffect(() => {
    if (!isDesktop) {
      setIsCollapsing(false);
      prevEffectiveExpanded.current = effectiveExpanded;
      return;
    }
    if (effectiveExpanded) {
      setIsCollapsing(false);
      prevEffectiveExpanded.current = true;
      return;
    }
    if (!prevEffectiveExpanded.current) return;
    prevEffectiveExpanded.current = false;
    setIsCollapsing(true);
    const doneTimer = window.setTimeout(() => setIsCollapsing(false), SIDEBAR_WIDTH_MS);
    return () => window.clearTimeout(doneTimer);
  }, [effectiveExpanded, isDesktop]);

  const panelWide = effectiveExpanded;
  const applyRailLayout = isDesktop && !sidebarOpen && !effectiveExpanded && !isCollapsing;
  const showBrandIcon = isDesktop && !sidebarOpen && !effectiveExpanded;

  const handleSidebarMouseEnter = () => {
    if (!isDesktop || sidebarExpanded || sidebarOpen) return;
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    setHoverExpanded(true);
  };

  const handleSidebarMouseLeave = () => {
    if (!isDesktop || sidebarExpanded) return;
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setHoverExpanded(false);
    }, HOVER_COLLAPSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sidebarExpanded || !isDesktop) {
      setHoverExpanded(false);
    }
  }, [sidebarExpanded, isDesktop]);

  useEffect(() => {
    const match = NAV_ITEMS.find(
      (item) =>
        item.children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)) ||
        (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))),
    );
    setOpenSection(match?.id ?? null);
  }, [pathname]);

  const closeMobileSidebar = () => setSidebarOpen(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.children?.length) {
      return item.children.some((child) => hasAccessTo(child.permission));
    }
    return hasAccessTo(item.permission);
  });

  return (
    <div
      className={`
        sidebar-shell relative z-40 shrink-0 w-0 overflow-visible transition-[width] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none
        ${panelWide ? "lg:w-64" : "lg:w-20"}
        ${panelWide ? "sidebar-expanded" : ""}
        ${isCollapsing ? "sidebar-collapsing" : ""}
      `}
    >
      <Transition
        show={sidebarOpen}
        as="div"
        className="fixed inset-0 z-[35] bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      <Transition
        show={showSidebar}
        unmount={false}
        as="div"
        id="sidebar"
        ref={sidebar}
        data-rail-layout={applyRailLayout ? "true" : undefined}
        data-rail-collapsed={showBrandIcon ? "true" : undefined}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={`
          flex lg:!flex flex-col fixed z-40 left-2 top-2
          lg:absolute
          lg:inset-y-0 lg:left-0 lg:top-0
          h-[calc(100dvh-1rem)] lg:h-[100dvh] overflow-y-auto sidebar-scroll
          w-[calc(100vw-1rem)] max-w-[24rem] lg:w-20 lg:max-w-none lg:sidebar-expanded:!w-64 shrink-0
          rounded-2xl lg:rounded-none
          transition-[width,box-shadow] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none
          bg-gradient-to-b from-[#0B1020] via-[#0E1426] to-[#0B1020]
          border border-white/[0.06] lg:border-y-0 lg:border-l-0
          ${isFloating ? "sidebar-panel-floating lg:z-50 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]" : "lg:z-40"}
        `}
        enterFrom="-translate-x-full"
        enterTo="translate-x-0"
        leaveFrom="translate-x-0"
        leaveTo="-translate-x-full"
      >
        <div
          className={`sidebar-header sticky top-0 z-30 flex items-center gap-3 p-4 mb-1 bg-[#0B1020]/92 backdrop-blur-md lg:static lg:bg-transparent lg:backdrop-blur-0 ${
            showBrandIcon ? "justify-center" : "justify-between"
          }`}
        >
          {!isCollapsed && (
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.08] active:translate-y-px transition-all duration-200"
              onClick={closeMobileSidebar}
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
            >
              <span className="sr-only">Cerrar Sidebar</span>
              <X className="h-5 w-5" />
            </button>
          )}
          <Logo sidebar />
        </div>

        <div className="sidebar-nav relative flex-1 min-h-0 px-2.5">
          <div className="sidebar-nav-body pt-2">
            <ul className="sidebar-nav-list flex flex-col space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                if (item.children?.length) {
                  const children = item.children.filter((child) => hasAccessTo(child.permission));
                  if (children.length === 0) return null;
                  const open = openSection === item.id;
                  return (
                    <SidebarLinkGroup
                      key={item.id}
                      open={open}
                      onToggle={() => setOpenSection(open ? null : item.id)}
                    >
                      {(handleClick, openGroup) => (
                        <>
                          <SidebarTooltip label={item.label} isCollapsed={isCollapsed}>
                            <a
                              href="#0"
                              className={`flex w-full items-center ${isCollapsed ? "justify-center" : "gap-3"} rounded-lg px-2 py-2 text-slate-300 hover:bg-white/[0.05] hover:text-white`}
                              onClick={(event) => {
                                event.preventDefault();
                                handleClick();
                              }}
                            >
                              <Icon className="h-5 w-5 shrink-0 text-indigo-300" />
                              <span className="sidebar-item-label text-sm font-medium">{item.label}</span>
                              <ChevronDown
                                className={`sidebar-item-chevron ml-auto h-4 w-4 text-slate-500 transition-transform ${
                                  openGroup ? "rotate-180 text-slate-300" : ""
                                }`}
                              />
                            </a>
                          </SidebarTooltip>
                          <div
                            className={`sidebar-submenu grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
                              openGroup ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
                            }`}
                          >
                            <ul className="min-h-0 overflow-hidden flex flex-col pl-2 space-y-0.5 border-l border-white/[0.07] ml-1.5">
                              {children.map((child) => (
                                <li key={child.id}>
                                  <SidebarLink href={child.href} nombre={child.id}>
                                    <span className="text-sm font-medium">{child.label}</span>
                                  </SidebarLink>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                    </SidebarLinkGroup>
                  );
                }

                if (!item.href) return null;
                return (
                  <li key={item.id} className="px-2 py-1.5">
                    <SidebarTooltip label={item.label} isCollapsed={isCollapsed}>
                      <SidebarLink href={item.href} nombre={item.id} exact>
                        <span className="inline-flex items-center gap-3">
                          <Icon className="h-5 w-5 shrink-0 text-indigo-300" />
                          <span className="sidebar-item-label text-sm font-medium">{item.label}</span>
                        </span>
                      </SidebarLink>
                    </SidebarTooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="sidebar-footer mt-auto hidden p-4 lg:block">
          <div className="sidebar-footer-divider mb-3 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <div className="sidebar-footer-toggle hidden lg:flex justify-center">
            <button
              type="button"
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.1] transition-all duration-200"
              title={sidebarExpanded ? "Colapsar sidebar" : "Expandir sidebar"}
            >
              <PanelLeftClose
                className={`w-5 h-5 text-slate-400 hover:text-slate-200 transition-transform ${
                  sidebarExpanded ? "" : "rotate-180"
                }`}
              />
            </button>
          </div>
        </div>
      </Transition>
    </div>
  );
}
