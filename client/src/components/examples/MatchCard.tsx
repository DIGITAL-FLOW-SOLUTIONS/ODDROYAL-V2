import MatchCard from '../MatchCard'

export default function MatchCardExample() {
  const mockMatch = {
    id: "1",
    homeTeam: { id: "1", name: "Manchester United", score: 1 },
    awayTeam: { id: "2", name: "Liverpool", score: 0 },
    kickoffTime: "2024-01-15T15:00:00Z",
    status: "live" as const,
    odds: { home: 2.1, draw: 3.2, away: 3.8 },
    league: "Premier League",
    minute: 67,
    isFavorite: true
  };

  const handleAddToBetSlip = (selection: any) => {
    console.log("Added to bet slip:", selection);
  };

  return (
    <div className="w-80">
      <MatchCard match={mockMatch} onAddToBetSlip={handleAddToBetSlip} />
    </div>
  )
}