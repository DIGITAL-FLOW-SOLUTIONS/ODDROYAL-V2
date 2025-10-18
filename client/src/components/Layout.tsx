import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import PageLoader from "@/components/PageLoader";
import { BetSlipProvider } from "@/contexts/BetSlipContext";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [betSlipSelections, setBetSlipSelections] = useState<BetSelection[]>([]);
  const [isBetSlipVisible, setIsBetSlipVisible] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { isPageLoading } = usePageLoading();
  
  // Check if we're on the homepage
  const isHomepage = location === '/';
  
  // Refs for scroll coordination
  const mainContentRef = useRef<HTMLDivElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [isInnerScrollLocked, setIsInnerScrollLocked] = useState(false);
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

  const handleAddToBetSlip = useCallback((selection: BetSelection) => {
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
  }, []);

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
      // Check authentication before making the request
      if (!isAuthenticated) {
        setLocation('/login');
        throw new Error('Please log in to place bets');
      }
      
      try {
        // BetSlip already validates and formats the data correctly
        // Just pass it through to the backend
        const response = await apiRequest('POST', '/api/bets', betData);
        const result = await response.json();
        return result;
      } catch (error: any) {
        // Handle authentication errors with comprehensive checking
        const errorMessage = error.message?.toLowerCase() || '';
        const isAuthError = errorMessage.includes('401') || 
                           errorMessage.includes('unauthorized') || 
                           errorMessage.includes('authorization') ||
                           errorMessage.includes('invalid or expired token') ||
                           errorMessage.includes('missing or invalid authorization header');
        
        if (isAuthError) {
          // Clear auth state and redirect to login
          logout();
          setLocation('/login');
          throw new Error('Please log in to place bets');
        }
        // Re-throw other errors to be handled by onError
        throw error;
      }
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
      
      // Show appropriate error message based on error type
      let title = "Bet Placement Failed";
      let description = "Please check your selections and try again.";
      
      if (error.message?.includes('log in')) {
        title = "Login Required";
        description = "You need to log in to place bets. Redirecting to login page...";
      } else if (error.message?.includes('Insufficient funds')) {
        title = "Insufficient Balance";
        description = "You don't have enough funds to place this bet. Please deposit more funds.";
      } else if (error.message?.includes('User profile not found')) {
        title = "Account Error";
        description = "There was an issue with your account. Please try logging out and back in.";
      } else if (error.message) {
        description = error.message;
      }
      
      toast({
        title,
        description,
        variant: "destructive"
      });
    }
  });

  const handlePlaceBet = async (betData: any) => {
    console.log("Placing bet:", betData);
    return await placeBetMutation.mutateAsync(betData);
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

  // Robust scroll coordination using wheel and touch events
  const handleWheelEvent = useCallback((e: WheelEvent) => {
    const mainContent = mainContentRef.current;
    if (!mainContent || isInnerScrollLocked) return;

    const { scrollTop, scrollHeight, clientHeight } = mainContent;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
    const isAtTop = scrollTop === 0;

    // If scrolling down and at bottom, unlock page scroll
    if (e.deltaY > 0 && isAtBottom) {
      setIsInnerScrollLocked(true);
      return;
    }

    // If scrolling up and at top, consume the scroll in main content
    if (e.deltaY < 0 && isAtTop) {
      return;
    }

    // Prevent page scroll while inner content is scrolling
    e.preventDefault();
    mainContent.scrollTop += e.deltaY;
  }, [isInnerScrollLocked]);

  // Handle page scroll to detect when to re-enable inner scroll
  const handlePageScroll = useCallback(() => {
    if (!isInnerScrollLocked) return;

    const mainContent = mainContentRef.current;
    if (!mainContent) return;

    // Check if main content top is aligned with viewport
    const rect = mainContent.getBoundingClientRect();
    const isMainAtTop = rect.top >= headerHeight - 10; // 10px tolerance

    if (isMainAtTop && window.pageYOffset <= 10) {
      setIsInnerScrollLocked(false);
    }
  }, [isInnerScrollLocked, headerHeight]);

  // Set up event listeners
  useEffect(() => {
    const mainContent = mainContentRef.current;
    
    if (mainContent) {
      mainContent.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    
    window.addEventListener('scroll', handlePageScroll, { passive: true });
    
    return () => {
      if (mainContent) {
        mainContent.removeEventListener('wheel', handleWheelEvent);
      }
      window.removeEventListener('scroll', handlePageScroll);
    };
  }, [handleWheelEvent, handlePageScroll]);

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  // Memoize bet slip context value to prevent re-renders
  const betSlipContextValue = useMemo(() => ({
    onAddToBetSlip: handleAddToBetSlip,
    betSlipSelections
  }), [handleAddToBetSlip, betSlipSelections]);

  return (
    <div ref={layoutContainerRef} className="bg-background w-full max-w-[100vw] overflow-x-hidden">
      {isPageLoading && <PageLoader />}
      <SidebarProvider style={style as React.CSSProperties}>
        {/* 3-column grid layout: sidebar | main-content | betslip */}
        <div className={`sportsbook-layout ${isHomepage ? 'homepage-layout' : ''}`}>
          
          {/* Sidebar - spans full height */}
          <div className="sportsbook-sidebar">
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
              maxHeight: !isInnerScrollLocked ? `calc(100vh - ${headerHeight}px)` : 'auto',
              overflowY: !isInnerScrollLocked ? 'auto' : 'visible',
              overflowX: 'hidden'
            }}
          >
            <div className="scrollbar-hide w-full">
              <BetSlipProvider value={betSlipContextValue}>
                {children}
              </BetSlipProvider>
            </div>
          </motion.div>

          {/* Bet slip - right column only, desktop (hidden on homepage) */}
          {!isHomepage && (
            <motion.div 
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
          )}
          
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