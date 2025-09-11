import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, DollarSign, Trash2 } from "lucide-react";

interface BetSelection {
  id: string;
  matchId: string;
  type: "home" | "draw" | "away";
  odds: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  stake?: number;
}

interface BetSlipProps {
  selections: BetSelection[];
  onRemoveSelection: (id: string) => void;
  onClearAll: () => void;
  onPlaceBet: (betData: any) => void;
}

export default function BetSlip({ 
  selections, 
  onRemoveSelection, 
  onClearAll, 
  onPlaceBet 
}: BetSlipProps) {
  const [stakes, setStakes] = useState<{ [key: string]: number }>({});
  const [expressStake, setExpressStake] = useState<number>(0);
  const [systemStake, setSystemStake] = useState<number>(0);

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
    // Simplified system bet calculation (2/3, 3/4, etc.)
    if (selections.length < 2) return { potentialReturn: 0, profit: 0 };
    
    const combinations = selections.length >= 3 ? 3 : 1; // Simplified
    const avgOdds = selections.reduce((acc, sel) => acc + sel.odds, 0) / selections.length;
    const potentialReturn = systemStake * Math.pow(avgOdds, 2) * combinations;
    
    return {
      combinations,
      potentialReturn,
      profit: potentialReturn - systemStake
    };
  };

  const updateStake = (selectionId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setStakes(prev => ({ ...prev, [selectionId]: numValue }));
  };

  const handlePlaceBet = (type: "single" | "express" | "system") => {
    let betData;
    
    switch (type) {
      case "single":
        betData = {
          type: "single",
          selections: calculateSingleReturns().filter(sel => sel.stake > 0),
          totalStake: Object.values(stakes).reduce((acc, stake) => acc + stake, 0)
        };
        break;
      case "express":
        betData = {
          type: "express",
          selections,
          stake: expressStake,
          ...calculateExpressReturn()
        };
        break;
      case "system":
        betData = {
          type: "system",
          selections,
          stake: systemStake,
          ...calculateSystemReturn()
        };
        break;
    }
    
    onPlaceBet(betData);
    console.log("Placed bet:", betData);
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
                          {selection.league} • {selection.type === "home" ? "1" : selection.type === "draw" ? "X" : "2"}
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
                disabled={Object.values(stakes).every(stake => stake === 0)}
                data-testid="button-place-single-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Place Single Bets
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
                        <p className="text-xs text-muted-foreground">{selection.type}</p>
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
                disabled={expressStake === 0 || selections.length < 2}
                data-testid="button-place-express-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Place Express Bet
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
                disabled={systemStake === 0 || selections.length < 3}
                data-testid="button-place-system-bet"
                className="w-full hover-elevate"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Place System Bet
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}