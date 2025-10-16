import { createContext, useContext, ReactNode } from 'react';
import { BetSelection } from '@shared/types';

interface BetSlipContextValue {
  onAddToBetSlip: (selection: BetSelection) => void;
  betSlipSelections: BetSelection[];
}

const BetSlipContext = createContext<BetSlipContextValue | undefined>(undefined);

export function BetSlipProvider({ 
  children, 
  value 
}: { 
  children: ReactNode; 
  value: BetSlipContextValue;
}) {
  return (
    <BetSlipContext.Provider value={value}>
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error('useBetSlip must be used within BetSlipProvider');
  }
  return context;
}
