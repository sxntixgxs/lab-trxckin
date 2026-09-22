import { Suspense } from "react";
import ActingBanner from "@/components/acting-banner";
import { UserSync } from "@/components/auth/UserSync";
import { EmpresaThemeVars } from "@/components/empresa-theme-vars";
import Header from "@/components/ui/header";
import Sidebar from "@/components/ui/sidebar";
import Loading from "./loading";

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex h-[100dvh]">
      <UserSync />
      <EmpresaThemeVars />
      <Sidebar />
      <div id="main-content" className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Header />
        <Suspense fallback={<Loading />}>
          <main className="grow">{children}</main>
        </Suspense>
        <ActingBanner />
      </div>
    </div>
  );
}
