"use client";

import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useState,
} from "react";
import { useSidebarState } from "@/hooks/useSidebarState";

interface ContextProps {
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarExpanded: boolean;
  setSidebarExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  sidebarLoaded: boolean;
}

export const AppContext = createContext<ContextProps>({
  sidebarOpen: false,
  setSidebarOpen: (): boolean => false,
  sidebarExpanded: true,
  setSidebarExpanded: () => {},
  sidebarLoaded: false,
});

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    isLoaded: sidebarLoaded,
    isExpanded: sidebarExpanded,
    setIsExpanded: setSidebarExpanded,
  } = useSidebarState(true);

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        sidebarExpanded,
        setSidebarExpanded,
        sidebarLoaded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useAppProvider = () => useContext(AppContext);
