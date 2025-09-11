import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import SportsSidebar from "@/components/SportsSidebar";
import MainContent from "@/components/MainContent";
import BetSlip from "@/components/BetSlip";
import Footer from "@/components/Footer";
import { SidebarProvider } from "@/components/ui/sidebar";

interface BetSelection {
  id: string;
  matchId: string;
  type: "home" | "draw" | "away";
  odds: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
}

export default function Home() {
  const [betSlipSelections, setBetSlipSelections] = useState<BetSelection[]>([]);

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
  };

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <SportsSidebar />
          
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            
            <div className="flex flex-1 overflow-hidden">
              {/* Main content area */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-1 overflow-auto"
              >
                <MainContent onAddToBetSlip={handleAddToBetSlip} />
                <Footer />
              </motion.div>

              {/* Bet slip - desktop */}
              <motion.div 
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="hidden lg:block w-80 border-l border-border bg-card overflow-auto"
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

        {/* Mobile bet slip - floating button */}
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="relative">
              <div className="bg-card border border-border rounded-lg p-4 shadow-lg max-w-sm">
                <BetSlip
                  selections={betSlipSelections}
                  onRemoveSelection={handleRemoveFromBetSlip}
                  onClearAll={handleClearBetSlip}
                  onPlaceBet={handlePlaceBet}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </SidebarProvider>
    </div>
  );
}