import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import SportsSidebar from "@/components/SportsSidebar";
import BetSlip from "@/components/BetSlip";
import Footer from "@/components/Footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";

interface BetSelection {
  id: string;
  matchId: string;
  type: "home" | "draw" | "away";
  odds: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market?: string;
  isLive?: boolean;
}

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [betSlipSelections, setBetSlipSelections] = useState<BetSelection[]>([]);
  const [isBetSlipVisible, setIsBetSlipVisible] = useState(false);

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

  const handlePlaceBet = (betData: any) => {
    console.log("Placing bet:", betData);
    // Here you would integrate with the backend to place the actual bet
    
    // For now, just show success and clear the bet slip
    alert(`Bet placed successfully! Type: ${betData.type}, Total Stake: $${betData.stake || betData.totalStake}`);
    setBetSlipSelections([]);
    setIsBetSlipVisible(false);
  };

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  // Create children with props by providing context
  const childrenWithProps = children;

  return (
    <div className="bg-background">
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex w-full min-h-screen">
          <SportsSidebar />
          
          <div className="flex flex-col flex-1">
            <Header />
            
            {/* Main content area with bet slip */}
            <div className="flex flex-1">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-1"
              >
                {childrenWithProps}
              </motion.div>

              {/* Bet slip - desktop */}
              <motion.div 
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="hidden lg:block w-80 border-l border-border bg-card"
              >
                <div className="p-4">
                  <BetSlip
                    selections={betSlipSelections}
                    onRemoveSelection={handleRemoveFromBetSlip}
                    onClearAll={handleClearBetSlip}
                    onPlaceBet={handlePlaceBet}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
        
        {/* Footer positioned below entire main content area - full width */}
        <Footer />

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
              className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-xl max-h-[80vh] overflow-auto"
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
                />
              </div>
            </motion.div>
          </div>
        )}
      </SidebarProvider>
    </div>
  );
}