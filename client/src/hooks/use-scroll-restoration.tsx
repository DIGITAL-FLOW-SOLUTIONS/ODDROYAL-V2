import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Hook that automatically scrolls to the top of the page when the route changes.
 * This ensures that when navigating between pages, users always start at the top
 * instead of maintaining the scroll position from the previous page.
 */
export function useScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    // Scroll to top when route changes
    window.scrollTo(0, 0);
  }, [location]);
}