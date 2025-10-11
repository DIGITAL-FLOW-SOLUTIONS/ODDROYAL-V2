import { createContext, useContext, useState, ReactNode } from "react";

interface PageLoadingContextType {
  isPageLoading: boolean;
  setPageLoading: (loading: boolean) => void;
}

const PageLoadingContext = createContext<PageLoadingContextType | undefined>(undefined);

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [isPageLoading, setIsPageLoading] = useState(false);

  const setPageLoading = (loading: boolean) => {
    setIsPageLoading(loading);
  };

  return (
    <PageLoadingContext.Provider value={{ isPageLoading, setPageLoading }}>
      {children}
    </PageLoadingContext.Provider>
  );
}

export function usePageLoading() {
  const context = useContext(PageLoadingContext);
  if (context === undefined) {
    throw new Error("usePageLoading must be used within a PageLoadingProvider");
  }
  return context;
}
