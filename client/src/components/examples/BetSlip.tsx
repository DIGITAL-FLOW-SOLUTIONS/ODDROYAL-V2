import BetSlip from '../BetSlip'

export default function BetSlipExample() {
  const mockSelections = [
    {
      id: "1-home",
      matchId: "1",
      type: "home" as const,
      odds: 2.1,
      homeTeam: "Manchester United",
      awayTeam: "Liverpool",
      league: "Premier League",
    },
    {
      id: "2-away",
      matchId: "2",
      type: "away" as const,
      odds: 2.9,
      homeTeam: "Chelsea",
      awayTeam: "Arsenal",
      league: "Premier League",
    }
  ];

  const handleRemoveSelection = (id: string) => {
    console.log("Removed selection:", id);
  };

  const handleClearAll = () => {
    console.log("Cleared all selections");
  };

  const handlePlaceBet = (betData: any) => {
    console.log("Placed bet:", betData);
  };

  return (
    <div className="w-80">
      <BetSlip
        selections={mockSelections}
        onRemoveSelection={handleRemoveSelection}
        onClearAll={handleClearAll}
        onPlaceBet={handlePlaceBet}
      />
    </div>
  )
}