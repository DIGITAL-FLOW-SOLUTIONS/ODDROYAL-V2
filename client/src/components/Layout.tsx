import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import SportsSidebar from "@/components/SportsSidebar";
import BetSlip from "@/components/BetSlip";
import Footer from "@/components/Footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { BetSelection } from "@shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [betSlipSelections, setBetSlipSelections] = useState<BetSelection[]>([]);
  const [isBetSlipVisible, setIsBetSlipVisible] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Refs for scroll coordination
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const betslipRef = useRef<HTMLDivElement>(null);
  const layoutRootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollPhase, setScrollPhase] = useState<'inner' | 'page'>('inner');
  const [headerHeight, setHeaderHeight] = useState(80);

  // Load bet slip from localStorage on mount
  useEffect(() => {
    const savedSelections = localStorage.getItem("betSlipSelections");
    if (savedSelections) {
      setBetSlipSelections(JSON.parse(savedSelections));
    }
  }, []);

  // Save bet slip to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("betSlipSelections", JSON.stringify(betSlipSelections));
  }, [betSlipSelections]);

  const handleAddToBetSlip = (selection: BetSelection) => {
    setBetSlipSelections(prev => {
      // Check if selection already exists
      const exists = prev.find(s => s.id === selection.id);
      if (exists) {
        console.log("Selection already in bet slip");
        return prev;
      }
      
      // Add new selection
      const newSelections = [...prev, selection];
      console.log("Added to bet slip:", selection);
      
      // Show bet slip on mobile after adding
      setIsBetSlipVisible(true);
      
      return newSelections;
    });
  };

  const handleRemoveFromBetSlip = (selectionId: string) => {
    setBetSlipSelections(prev => prev.filter(s => s.id !== selectionId));
    console.log("Removed from bet slip:", selectionId);
  };

  const handleClearBetSlip = () => {
    setBetSlipSelections([]);
    console.log("Cleared bet slip");
  };

  // Place bet mutation with proper error handling and loading states
  const placeBetMutation = useMutation({
    mutationFn: async (betData: any) => {
      // BetSlip already validates and formats the data correctly
      // Just pass it through to the backend
      const response = await apiRequest('POST', '/api/bets', betData);
      return await response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Bet Placed Successfully!",
          description: `Your bet has been placed. Bet ID: ${result.data.bet.id}`,
          variant: "default"
        });
        setBetSlipSelections([]);
        setIsBetSlipVisible(false);
        // Invalidate relevant queries to update user balance and bets
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/bets'] });
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    },
    onError: (error: any) => {
      console.error('Error placing bet:', error);
      toast({
        title: "Failed to Place Bet",
        description: error.message || "Please check your balance and try again.",
        variant: "destructive"
      });
    }
  });

  const handlePlaceBet = (betData: any) => {
    console.log("Placing bet:", betData);
    placeBetMutation.mutate(betData);
  };

  // Measure header height dynamically
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // Helper functions for scroll coordination
  const isAtBottom = useCallback((element: HTMLElement) => {
    if (!element) return false;
    const { scrollTop, scrollHeight, clientHeight } = element;
    return Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
  }, []);

  const isAtTop = useCallback((element: HTMLElement) => {
    if (!element) return false;
    return element.scrollTop === 0;
  }, []);

  const consumeScroll = useCallback((element: HTMLElement, delta: number) => {
    if (!element) return delta;
    
    const { scrollTop, scrollHeight, clientHeight } = element;
    const maxScroll = scrollHeight - clientHeight;
    const newScrollTop = Math.max(0, Math.min(maxScroll, scrollTop + delta));
    const consumed = newScrollTop - scrollTop;
    
    element.scrollTop = newScrollTop;
    return delta - consumed;
  }, []);

  // Central scroll router with capture-phase event handling
  const handleWheelEvent = useCallback((e: WheelEvent) => {
    const mainContent = mainContentRef.current;
    if (!mainContent) return;

    const delta = e.deltaY;
    const mainAtBottom = isAtBottom(mainContent);
    const mainAtTop = isAtTop(mainContent);

    if (scrollPhase === 'inner') {
      // In inner phase: all scroll goes to middle content first
      if (delta > 0) {
        // Scrolling down
        if (mainAtBottom) {
          // Middle content at bottom, switch to page scroll
          setScrollPhase('page');
          return; // Allow default page scroll
        } else {
          // Route to middle content regardless of event target
          e.preventDefault();
          consumeScroll(mainContent, delta);
        }
      } else {
        // Scrolling up
        if (mainAtTop) {
          // Let page scroll if it can
          return;
        } else {
          // Route to middle content
          e.preventDefault();
          consumeScroll(mainContent, delta);
        }
      }
    } else {
      // In page phase: let page scroll, but monitor for switch back to inner
      if (delta < 0) {
        // Scrolling up - check if we should switch back to inner
        const rect = mainContent.getBoundingClientRect();
        const isMainNearTop = rect.top >= headerHeight - 10;
        
        if (isMainNearTop && window.pageYOffset <= 10) {
          setScrollPhase('inner');
          e.preventDefault();
          consumeScroll(mainContent, delta);
        }
      }
    }
  }, [scrollPhase, headerHeight, isAtBottom, isAtTop, consumeScroll]);

  // Touch event handling for mobile
  const lastTouchY = useRef<number>(0);
  
  const handleTouchStart = useCallback((e: TouchEvent) => {
    lastTouchY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!mainContentRef.current) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = lastTouchY.current - currentY;
    lastTouchY.current = currentY;
    
    // Create a synthetic wheel event to reuse the same logic
    const syntheticEvent = new WheelEvent('wheel', {
      deltaY,
      cancelable: true,
      bubbles: true
    });
    
    handleWheelEvent(syntheticEvent);
    
    if (syntheticEvent.defaultPrevented) {
      e.preventDefault();
    }
  }, [handleWheelEvent]);

  // Set up event listeners with capture phase
  useEffect(() => {
    const layoutRoot = layoutRootRef.current;
    
    if (layoutRoot) {
      // Use capture phase to intercept all scroll events
      layoutRoot.addEventListener('wheel', handleWheelEvent, { 
        passive: false, 
        capture: true 
      });
      layoutRoot.addEventListener('touchstart', handleTouchStart, { 
        passive: true, 
        capture: true 
      });
      layoutRoot.addEventListener('touchmove', handleTouchMove, { 
        passive: false, 
        capture: true 
      });
    }
    
    return () => {
      if (layoutRoot) {
        layoutRoot.removeEventListener('wheel', handleWheelEvent);
        layoutRoot.removeEventListener('touchstart', handleTouchStart);
        layoutRoot.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [handleWheelEvent, handleTouchStart, handleTouchMove]);

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  // Create children with props by providing context
  const childrenWithProps = React.cloneElement(children as React.ReactElement, {
    onAddToBetSlip: handleAddToBetSlip
  });

  return (
    <div ref={layoutRootRef} className="bg-background">
      <SidebarProvider style={style as React.CSSProperties}>
        {/* 3-column grid layout: sidebar | main-content | betslip */}
        <div className="sportsbook-layout">
          
          {/* Sidebar - spans full height */}
          <div ref={sidebarRef} className="sportsbook-sidebar">
            <SportsSidebar />
          </div>
          
          {/* Header - spans middle and right columns */}
          <div ref={headerRef} className="sportsbook-header">
            <Header />
          </div>
          
          {/* Main content - middle column only */}
          <motion.div 
            ref={mainContentRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="sportsbook-main scrollbar-hide"
            style={{
              maxHeight: scrollPhase === 'inner' ? `calc(100vh - ${headerHeight}px)` : 'auto',
              overflowY: scrollPhase === 'inner' ? 'auto' : 'visible',
              overflowX: 'hidden'
            }}
          >
            <div className="scrollbar-hide w-full">
              {childrenWithProps}
            </div>
          </motion.div>

          {/* Bet slip - right column only, desktop */}
          <motion.div 
            ref={betslipRef}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="sportsbook-betslip hidden lg:block bg-background border-l border-border scrollbar-hide"
            style={{ 
              maxHeight: `calc(100vh - ${headerHeight}px)`, 
              overflowY: 'auto',
              overflowX: 'hidden'
            }}
          >
            <div className="p-4">
              <BetSlip
                selections={betSlipSelections}
                onRemoveSelection={handleRemoveFromBetSlip}
                onClearAll={handleClearBetSlip}
                onPlaceBet={handlePlaceBet}
                isPlacingBet={placeBetMutation.isPending}
              />
            </div>
          </motion.div>
          
          {/* Footer - spans middle and right columns */}
          <div className="sportsbook-footer">
            <Footer />
          </div>
        </div>
      </SidebarProvider>

      {/* Mobile bet slip toggle button */}
      {betSlipSelections.length > 0 && (
        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          <Button
            onClick={() => setIsBetSlipVisible(!isBetSlipVisible)}
            data-testid="button-mobile-bet-slip-toggle"
            className="rounded-full w-14 h-14 shadow-lg hover-elevate"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -top-2 -right-2 bg-destructive text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              {betSlipSelections.length}
            </span>
          </Button>
        </div>
      )}

      {/* Mobile bet slip modal */}
      {isBetSlipVisible && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-xl max-h-[80vh] overflow-auto scrollbar-hide"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Bet Slip</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsBetSlipVisible(false)}
                  data-testid="button-close-mobile-bet-slip"
                >
                  Close
                </Button>
              </div>
              <BetSlip
                selections={betSlipSelections}
                onRemoveSelection={handleRemoveFromBetSlip}
                onClearAll={handleClearBetSlip}
                onPlaceBet={handlePlaceBet}
                isPlacingBet={placeBetMutation.isPending}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}