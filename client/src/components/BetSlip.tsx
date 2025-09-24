import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, DollarSign, Trash2, AlertTriangle } from "lucide-react";
import { BetSelection } from "@shared/types";
import { betPlacementSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

interface BetSlipProps {
  selections: BetSelection[];
  onRemoveSelection: (id: string) => void;
  onClearAll: () => void;
  onPlaceBet: (betData: any) => void;
  isPlacingBet?: boolean;
}

export default function BetSlip({ 
  selections, 
  onRemoveSelection, 
  onClearAll, 
  onPlaceBet,
  isPlacingBet = false
}: BetSlipProps) {
  const [stakes, setStakes] = useState<{ [key: string]: number }>({});
  const [expressStake, setExpressStake] = useState<number>(0);
  const [systemStake, setSystemStake] = useState<number>(0);
  const { toast } = useToast();

  // Calculate potential returns
  const calculateSingleReturns = () => {
    return selections.map(selection => {
      const stake = stakes[selection.id] || 0;
      return {
        ...selection,
        stake,
        potentialReturn: stake * selection.odds,
        profit: (stake * selection.odds) - stake
      };
    });
  };

  const calculateExpressReturn = () => {
    const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialReturn = expressStake * totalOdds;
    return {
      totalOdds,
      potentialReturn,
      profit: potentialReturn - expressStake
    };
  };

  const calculateSystemReturn = () => {
    if (selections.length < 3) return { combinations: 0, potentialReturn: 0, profit: 0 };
    
    // Calculate number of 2-fold combinations (most common system bet)
    const combinations = (selections.length * (selections.length - 1)) / 2;
    
    // Calculate expected return based on simplified system bet calculation
    // For a proper implementation, we'd need to calculate all possible combinations
    // and their probabilities, but for now we'll use a simplified formula
    const avgOdds = selections.reduce((acc, sel) => acc + sel.odds, 0) / selections.length;
    const estimatedSuccessRate = 0.4; // Assume 40% success rate for system bets
    const potentialReturn = systemStake * combinations * Math.pow(avgOdds, 2) * estimatedSuccessRate;
    
    return {
      combinations: Math.floor(combinations),
      potentialReturn,
      profit: potentialReturn - systemStake
    };
  };

  const updateStake = (selectionId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setStakes(prev => ({ ...prev, [selectionId]: numValue }));
  };

  const validateBetData = (betData: any) => {
    try {
      return betPlacementSchema.parse(betData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        toast({
          title: "Bet Validation Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
      throw error;
    }
  };

  const handlePlaceBet = async (type: "single" | "express" | "system") => {
    try {
      switch (type) {
        case "single":
          // Validate that we have at least one selection with stake
          const validSingleBets = selections.filter(sel => stakes[sel.id] && stakes[sel.id] > 0);
          if (validSingleBets.length === 0) {
            toast({
              title: "No Stakes Set",
              description: "Please set stakes for at least one selection.",
              variant: "destructive"
            });
            return;
          }
          
          // For single bets, place each selection with a stake as a separate bet
          for (const sel of validSingleBets) {
            const betData = {
              type: "single" as const,
              totalStake: stakes[sel.id].toFixed(2),
              selections: [{
                fixtureId: sel.fixtureId || sel.matchId,
                homeTeam: sel.homeTeam,
                awayTeam: sel.awayTeam,
                league: sel.league,
                market: sel.market || "1x2",
                selection: sel.selection || sel.type,
                odds: sel.odds.toFixed(4)
              }]
            };
            
            // Validate before sending
            const validatedBetData = validateBetData(betData);
            onPlaceBet(validatedBetData);
            console.log("Placed single bet:", validatedBetData);
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          break;
          
        case "express":
          if (expressStake === 0) {
            toast({
              title: "No Stake Set",
              description: "Please set a stake for the express bet.",
              variant: "destructive"
            });
            return;
          }
          
          if (selections.length < 2) {
            toast({
              title: "Insufficient Selections",
              description: "Express bets require at least 2 selections.",
              variant: "destructive"
            });
            return;
          }
          
          const expressBetData = {
            type: "express" as const,
            totalStake: expressStake.toFixed(2),
            selections: selections.map(sel => ({
              fixtureId: sel.fixtureId || sel.matchId,
              homeTeam: sel.homeTeam,
              awayTeam: sel.awayTeam,
              league: sel.league,
              market: sel.market || "1x2",
              selection: sel.selection || sel.type,
              odds: sel.odds.toFixed(4)
            }))
          };
          
          // Validate before sending
          const validatedExpressBetData = validateBetData(expressBetData);
          onPlaceBet(validatedExpressBetData);
          console.log("Placed express bet:", validatedExpressBetData);
          break;
          
        case "system":
          if (systemStake === 0) {
            toast({
              title: "No Stake Set",
              description: "Please set a stake for the system bet.",
              variant: "destructive"
            });
            return;
          }
          
          if (selections.length < 3) {
            toast({
              title: "Insufficient Selections",
              description: "System bets require at least 3 selections.",
              variant: "destructive"
            });
            return;
          }
          
          const systemBetData = {
            type: "system" as const,
            totalStake: systemStake.toFixed(2),
            selections: selections.map(sel => ({
              fixtureId: sel.fixtureId || sel.matchId,
              homeTeam: sel.homeTeam,
              awayTeam: sel.awayTeam,
              league: sel.league,
              market: sel.market || "1x2",
              selection: sel.selection || sel.type,
              odds: sel.odds.toFixed(4)
            }))
          };
          
          // Validate before sending
          const validatedSystemBetData = validateBetData(systemBetData);
          onPlaceBet(validatedSystemBetData);
          console.log("Placed system bet:", validatedSystemBetData);
          break;
      }
    } catch (error) {
      console.error("Error placing bet:", error);
      toast({
        title: "Bet Placement Failed",
        description: "Please check your selections and try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="w-full" data-testid="card-bet-slip">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-display">Bet Slip</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="text-selection-count">
              {selections.length}
            </Badge>
            {selections.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearAll}
                data-testid="button-clear-all"
                className="h-6 w-6 hover-elevate"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {selections.length === 0 ? (
          <div className="text-center py-8">
            <Calculator className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Add selections to start building your bet
            </p>
          </div>
        ) : (
          <Tabs defaultValue="ordinary" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ordinary" data-testid="tab-ordinary">Ordinary</TabsTrigger>
              <TabsTrigger value="express" data-testid="tab-express">Express</TabsTrigger>
              <TabsTrigger value="system" data-testid="tab-system">System</TabsTrigger>
            </TabsList>

            {/* Single Bets */}
            <TabsContent value="ordinary" className="space-y-3">
              <AnimatePresence>
                {selections.map((selection, index) => (
                  <motion.div
                    key={selection.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="bg-card border border-card-border rounded-md p-3"
                    data-testid={`selection-${selection.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {selection.homeTeam} vs {selection.awayTeam}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selection.league} • {selection.selection || selection.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {selection.odds.toFixed(2)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveSelection(selection.id)}
                          data-testid={`button-remove-${selection.id}`}
                          className="h-5 w-5 hover-elevate"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Input
                        type="number"
                        placeholder="Stake"
                        value={stakes[selection.id] || ""}
                        onChange={(e) => updateStake(selection.id, e.target.value)}
                        data-testid={`input-stake-${selection.id}`}
                        className="h-8"
                      />
                      {stakes[selection.id] > 0 && (
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span>Potential Return:</span>
                            <span className="font-medium text-chart-4" data-testid={`text-return-${selection.id}`}>
                              ${(stakes[selection.id] * selection.odds).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Profit:</span>
                            <span className="font-medium text-chart-4">
                              ${((stakes[selection.id] * selection.odds) - stakes[selection.id]).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              <Button
                onClick={() => handlePlaceBet("single")}
                disabled={Object.values(stakes).every(stake => stake === 0) || isPlacingBet}
                data-testid="button-place-single-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {isPlacingBet ? "Placing Bet..." : "Place Single Bets"}
              </Button>
            </TabsContent>

            {/* Express Bet */}
            <TabsContent value="express" className="space-y-3">
              <div className="bg-card border border-card-border rounded-md p-3">
                <div className="space-y-2 mb-3">
                  {selections.map((selection, index) => (
                    <div key={selection.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm">{selection.homeTeam} vs {selection.awayTeam}</p>
                        <p className="text-xs text-muted-foreground">{selection.selection || selection.type}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {selection.odds.toFixed(2)}
                      </Badge>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-border pt-2 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Odds:</span>
                    <span className="font-medium" data-testid="text-express-odds">
                      {calculateExpressReturn().totalOdds.toFixed(2)}
                    </span>
                  </div>
                  
                  <Input
                    type="number"
                    placeholder="Express stake"
                    value={expressStake || ""}
                    onChange={(e) => setExpressStake(parseFloat(e.target.value) || 0)}
                    data-testid="input-express-stake"
                    className="h-8"
                  />
                  
                  {expressStake > 0 && (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Potential Return:</span>
                        <span className="font-medium text-chart-4" data-testid="text-express-return">
                          ${calculateExpressReturn().potentialReturn.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Profit:</span>
                        <span className="font-medium text-chart-4">
                          ${calculateExpressReturn().profit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <Button
                onClick={() => handlePlaceBet("express")}
                disabled={expressStake === 0 || selections.length < 2 || isPlacingBet}
                data-testid="button-place-express-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {isPlacingBet ? "Placing Bet..." : "Place Express Bet"}
              </Button>
            </TabsContent>

            {/* System Bet */}
            <TabsContent value="system" className="space-y-3">
              <div className="bg-card border border-card-border rounded-md p-3">
                <p className="text-sm mb-2">System bet (minimum 3 selections required)</p>
                
                {selections.length >= 3 && (
                  <>
                    <div className="space-y-2 mb-3">
                      {selections.map((selection) => (
                        <div key={selection.id} className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm">{selection.homeTeam} vs {selection.awayTeam}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {selection.odds.toFixed(2)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    
                    <div className="border-t border-border pt-2 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Combinations:</span>
                        <span className="font-medium" data-testid="text-system-combinations">
                          {calculateSystemReturn().combinations}
                        </span>
                      </div>
                      
                      <Input
                        type="number"
                        placeholder="System stake"
                        value={systemStake || ""}
                        onChange={(e) => setSystemStake(parseFloat(e.target.value) || 0)}
                        data-testid="input-system-stake"
                        className="h-8"
                      />
                      
                      {systemStake > 0 && (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span>Potential Return:</span>
                            <span className="font-medium text-chart-4" data-testid="text-system-return">
                              ${calculateSystemReturn().potentialReturn.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Profit:</span>
                            <span className="font-medium text-chart-4">
                              ${calculateSystemReturn().profit.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              
              <Button
                onClick={() => handlePlaceBet("system")}
                disabled={systemStake === 0 || selections.length < 3 || isPlacingBet}
                data-testid="button-place-system-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {isPlacingBet ? "Placing Bet..." : "Place System Bet"}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}