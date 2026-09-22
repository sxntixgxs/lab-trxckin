"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-expanded";

export function useSidebarState(defaultValue: boolean = true) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isExpanded, setIsExpandedState] = useState(defaultValue);

  // Cargar desde localStorage despues del mount (solo client-side)
  useEffect(() => {
    try {
      // En pantallas <= 1360x768 iniciamos colapsada para aprovechar espacio
      const isSmallScreen =
        window.innerWidth <= 1360 || window.innerHeight <= 768;
      if (isSmallScreen) {
        setIsExpandedState(false);
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          setIsExpandedState(JSON.parse(stored));
        }
      }
    } catch (error) {
      console.warn("Error loading sidebar state:", error);
    }
    setIsLoaded(true);
  }, []);

  // Wrapper que persiste a localStorage
  const setIsExpanded = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setIsExpandedState((prev) => {
        const newValue = typeof value === "function" ? value(prev) : value;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));
        } catch (error) {
          console.warn("Error saving sidebar state:", error);
        }
        return newValue;
      });
    },
    []
  );

  const toggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, [setIsExpanded]);

  return {
    isLoaded,
    isExpanded,
    setIsExpanded,
    toggle,
  };
}
