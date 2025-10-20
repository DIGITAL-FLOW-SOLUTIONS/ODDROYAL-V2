/**
 * Market Generator Service
 * 
 * Generates comprehensive betting markets for all sports based on match data.
 * Creates realistic odds deterministically to provide consistent betting experience.
 */

interface MarketOutcome {
  name: string;
  price: number;
  point?: number;
}

interface Market {
  key: string;
  name: string;
  outcomes: MarketOutcome[];
  description?: string;
}

class MarketGenerator {
  private rng: () => number = Math.random;
  
  /**
   * Seeded pseudo-random number generator for deterministic odds
   * Uses Park-Miller PRNG with proper state management
   */
  private seedRandom(seed: string): () => number {
    // Generate initial seed from string
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Ensure initial state is in valid range [1, 2147483646]
    let state = Math.abs(hash % 2147483647);
    if (state === 0) state = 1;
    
    return () => {
      // Park-Miller multiplicative congruential generator
      state = (state * 16807) % 2147483647;
      // Normalize to [0, 1)
      return (state - 1) / 2147483646;
    };
  }
  
  /**
   * Generate random odds within a range (deterministic based on seed)
   */
  private generateOdds(min: number = 1.5, max: number = 5.0): number {
    return parseFloat((this.rng() * (max - min) + min).toFixed(2));
  }
  
  /**
   * Generate balanced odds that sum to 100% probability (accounting for bookmaker margin)
   */
  private generateBalancedOdds(count: number): number[] {
    const rawProbs = Array.from({ length: count }, () => this.rng());
    const sum = rawProbs.reduce((a, b) => a + b, 0);
    const margin = 1.05; // 5% bookmaker margin
    return rawProbs.map(p => parseFloat((1 / ((p / sum) / margin)).toFixed(2)));
  }
  
  /**
   * Generate markets for Football
   */
  private generateFootballMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Over/Under Goals
    const totals = [0.5, 1.5, 2.5, 3.5, 4.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Asian Handicap
    const handicaps = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
    handicaps.forEach(handicap => {
      const [home, away] = this.generateBalancedOdds(2);
      markets.push({
        key: `handicap_${handicap}`,
        name: `Asian Handicap`,
        description: `${handicap > 0 ? '+' : ''}${handicap}`,
        outcomes: [
          { name: homeTeam, price: home, point: handicap },
          { name: awayTeam, price: away, point: -handicap }
        ]
      });
    });
    
    // Both Teams To Score
    const [yes, no] = this.generateBalancedOdds(2);
    markets.push({
      key: 'btts',
      name: 'Both Teams To Score',
      outcomes: [
        { name: 'Yes', price: yes },
        { name: 'No', price: no }
      ]
    });
    
    // Double Chance
    const [dc1, dc2, dc3] = this.generateBalancedOdds(3);
    markets.push({
      key: 'double_chance',
      name: 'Double Chance',
      outcomes: [
        { name: `${homeTeam} or Draw`, price: dc1 },
        { name: `${awayTeam} or Draw`, price: dc2 },
        { name: `${homeTeam} or ${awayTeam}`, price: dc3 }
      ]
    });
    
    // Half Time/Full Time
    const htftOutcomes = [
      `${homeTeam}/${homeTeam}`, `${homeTeam}/Draw`, `${homeTeam}/${awayTeam}`,
      `Draw/${homeTeam}`, `Draw/Draw`, `Draw/${awayTeam}`,
      `${awayTeam}/${homeTeam}`, `${awayTeam}/Draw`, `${awayTeam}/${awayTeam}`
    ];
    markets.push({
      key: 'htft',
      name: 'Half Time/Full Time',
      outcomes: htftOutcomes.map(name => ({
        name,
        price: this.generateOdds(3, 15)
      }))
    });
    
    // Correct Score
    const scores = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '2-2', '3-0', '0-3', '3-1', '1-3', '3-2', '2-3', 'Other'];
    markets.push({
      key: 'correct_score',
      name: 'Correct Score',
      outcomes: scores.map(score => ({
        name: score,
        price: this.generateOdds(5, 25)
      }))
    });
    
    // First Half markets
    const [h1, hd, h2] = this.generateBalancedOdds(3);
    markets.push({
      key: '1st_half_result',
      name: '1st Half Result',
      outcomes: [
        { name: homeTeam, price: h1 },
        { name: 'Draw', price: hd },
        { name: awayTeam, price: h2 }
      ]
    });
    
    // Second Half markets
    const [s1, sd, s2] = this.generateBalancedOdds(3);
    markets.push({
      key: '2nd_half_result',
      name: '2nd Half Result',
      outcomes: [
        { name: homeTeam, price: s1 },
        { name: 'Draw', price: sd },
        { name: awayTeam, price: s2 }
      ]
    });
    
    // Corners
    const cornerTotals = [8.5, 9.5, 10.5, 11.5];
    cornerTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `corners_${total}`,
        name: `Total Corners`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // 1st Half Corners
    const [c1o, c1u] = this.generateBalancedOdds(2);
    markets.push({
      key: '1st_half_corners',
      name: '1st Half Corners',
      description: 'Over/Under 4.5',
      outcomes: [
        { name: 'Over 4.5', price: c1o },
        { name: 'Under 4.5', price: c1u }
      ]
    });
    
    // 2nd Half Corners
    const [c2o, c2u] = this.generateBalancedOdds(2);
    markets.push({
      key: '2nd_half_corners',
      name: '2nd Half Corners',
      description: 'Over/Under 5.5',
      outcomes: [
        { name: 'Over 5.5', price: c2o },
        { name: 'Under 5.5', price: c2u }
      ]
    });
    
    // Yellow Cards
    const cardTotals = [2.5, 3.5, 4.5];
    cardTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `cards_${total}`,
        name: `Total Yellow Cards`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Goal in Both Halves
    const [gbhY, gbhN] = this.generateBalancedOdds(2);
    markets.push({
      key: 'goal_both_halves',
      name: 'Goal in Both Halves',
      outcomes: [
        { name: 'Yes', price: gbhY },
        { name: 'No', price: gbhN }
      ]
    });
    
    // Any Team To Win To Nil
    const [h0, a0, none] = this.generateBalancedOdds(3);
    markets.push({
      key: 'win_to_nil',
      name: 'Any Team To Win To Nil',
      outcomes: [
        { name: `${homeTeam} To Win To Nil`, price: h0 },
        { name: `${awayTeam} To Win To Nil`, price: a0 },
        { name: 'No', price: none }
      ]
    });
    
    // Time of First Goal
    const timeSlots = ['0-15 min', '16-30 min', '31-45 min', '46-60 min', '61-75 min', '76-90 min', 'No Goal'];
    markets.push({
      key: 'first_goal_time',
      name: 'Time of First Goal',
      outcomes: timeSlots.map(slot => ({
        name: slot,
        price: this.generateOdds(4, 10)
      }))
    });
    
    // Individual Total - Home Team
    const homeTeamTotals = [0.5, 1.5, 2.5];
    homeTeamTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `home_total_${total}`,
        name: `${homeTeam} Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Individual Total - Away Team
    const awayTeamTotals = [0.5, 1.5, 2.5];
    awayTeamTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `away_total_${total}`,
        name: `${awayTeam} Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Total Parity (Odd/Even)
    const [odd, even] = this.generateBalancedOdds(2);
    markets.push({
      key: 'total_parity',
      name: 'Total Goals Odd/Even',
      outcomes: [
        { name: 'Odd', price: odd },
        { name: 'Even', price: even }
      ]
    });
    
    // Result And Both Teams To Score
    const rbttsOutcomes = [
      { name: `${homeTeam} & Yes`, price: this.generateOdds(2.5, 6) },
      { name: `Draw & Yes`, price: this.generateOdds(4, 10) },
      { name: `${awayTeam} & Yes`, price: this.generateOdds(2.5, 6) },
      { name: `${homeTeam} & No`, price: this.generateOdds(2, 5) },
      { name: `Draw & No`, price: this.generateOdds(3, 8) },
      { name: `${awayTeam} & No`, price: this.generateOdds(2, 5) }
    ];
    markets.push({
      key: 'result_btts',
      name: 'Result And Both Teams To Score',
      outcomes: rbttsOutcomes
    });
    
    // Double Chance And Both Teams To Score
    const dcbttsOutcomes = [
      { name: `${homeTeam}/Draw & Yes`, price: this.generateOdds(2, 5) },
      { name: `${homeTeam}/Draw & No`, price: this.generateOdds(1.8, 4) },
      { name: `${awayTeam}/Draw & Yes`, price: this.generateOdds(2, 5) },
      { name: `${awayTeam}/Draw & No`, price: this.generateOdds(1.8, 4) },
      { name: `${homeTeam}/${awayTeam} & Yes`, price: this.generateOdds(1.5, 3.5) },
      { name: `${homeTeam}/${awayTeam} & No`, price: this.generateOdds(1.8, 4) }
    ];
    markets.push({
      key: 'dc_btts',
      name: 'Double Chance And Both Teams To Score',
      outcomes: dcbttsOutcomes
    });
    
    // Clean Sheet (Win To Nil) - expanded
    const [hCS, aCS, neitherCS] = this.generateBalancedOdds(3);
    markets.push({
      key: 'clean_sheet',
      name: 'Clean Sheet (Win To Nil)',
      outcomes: [
        { name: `${homeTeam} Clean Sheet`, price: hCS },
        { name: `${awayTeam} Clean Sheet`, price: aCS },
        { name: 'Neither', price: neitherCS }
      ]
    });
    
    // Penalty Awarded
    const [penYes, penNo] = this.generateBalancedOdds(2);
    markets.push({
      key: 'penalty',
      name: 'Penalty Awarded',
      outcomes: [
        { name: 'Yes', price: penYes },
        { name: 'No', price: penNo }
      ]
    });
    
    // 1st Half Yellow Cards
    const [yc1o, yc1u] = this.generateBalancedOdds(2);
    markets.push({
      key: '1st_half_cards',
      name: '1st Half Yellow Cards',
      description: 'Over/Under 1.5',
      outcomes: [
        { name: 'Over 1.5', price: yc1o },
        { name: 'Under 1.5', price: yc1u }
      ]
    });
    
    // 2nd Half Yellow Cards
    const [yc2o, yc2u] = this.generateBalancedOdds(2);
    markets.push({
      key: '2nd_half_cards',
      name: '2nd Half Yellow Cards',
      description: 'Over/Under 2.5',
      outcomes: [
        { name: 'Over 2.5', price: yc2o },
        { name: 'Under 2.5', price: yc2u }
      ]
    });
    
    // Shots on Target
    const shotTotals = [8.5, 9.5, 10.5];
    shotTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `shots_${total}`,
        name: `Total Shots on Target`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Offsides
    const offsideTotals = [3.5, 4.5, 5.5];
    offsideTotals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `offsides_${total}`,
        name: `Total Offsides`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // 1st Half Totals
    const h1Totals = [0.5, 1.5];
    h1Totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `1h_totals_${total}`,
        name: `1st Half Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // 2nd Half Totals
    const h2Totals = [0.5, 1.5, 2.5];
    h2Totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `2h_totals_${total}`,
        name: `2nd Half Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    return markets;
  }
  
  /**
   * Generate markets for Basketball
   */
  private generateBasketballMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Total Points
    const totals = [180.5, 190.5, 200.5, 210.5, 220.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Points`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Point Spread
    const spreads = [-5.5, -7.5, -10.5];
    spreads.forEach(spread => {
      const [home, away] = this.generateBalancedOdds(2);
      markets.push({
        key: `spread_${spread}`,
        name: `Point Spread`,
        description: `${spread > 0 ? '+' : ''}${spread}`,
        outcomes: [
          { name: homeTeam, price: home, point: spread },
          { name: awayTeam, price: away, point: -spread }
        ]
      });
    });
    
    // Quarter Winners
    for (let q = 1; q <= 4; q++) {
      const [h, a] = this.generateBalancedOdds(2);
      markets.push({
        key: `${q}q_winner`,
        name: `${q}${q === 1 ? 'st' : q === 2 ? 'nd' : q === 3 ? 'rd' : 'th'} Quarter Winner`,
        outcomes: [
          { name: homeTeam, price: h },
          { name: awayTeam, price: a }
        ]
      });
    }
    
    // First Half Winner
    const [h1, a1] = this.generateBalancedOdds(2);
    markets.push({
      key: '1st_half_winner',
      name: '1st Half Winner',
      outcomes: [
        { name: homeTeam, price: h1 },
        { name: awayTeam, price: a1 }
      ]
    });
    
    return markets;
  }
  
  /**
   * Generate markets for American Football
   */
  private generateAmericanFootballMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Total Points
    const totals = [40.5, 45.5, 50.5, 55.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Points`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Point Spread
    const spreads = [-3.5, -7.5, -10.5, -14.5];
    spreads.forEach(spread => {
      const [home, away] = this.generateBalancedOdds(2);
      markets.push({
        key: `spread_${spread}`,
        name: `Point Spread`,
        description: `${spread > 0 ? '+' : ''}${spread}`,
        outcomes: [
          { name: homeTeam, price: home, point: spread },
          { name: awayTeam, price: away, point: -spread }
        ]
      });
    });
    
    // Quarter Winners
    for (let q = 1; q <= 4; q++) {
      const [h, a] = this.generateBalancedOdds(2);
      markets.push({
        key: `${q}q_winner`,
        name: `${q}${q === 1 ? 'st' : q === 2 ? 'nd' : q === 3 ? 'rd' : 'th'} Quarter Winner`,
        outcomes: [
          { name: homeTeam, price: h },
          { name: awayTeam, price: a }
        ]
      });
    }
    
    // First Half Winner
    const [h1, a1] = this.generateBalancedOdds(2);
    markets.push({
      key: '1st_half_winner',
      name: '1st Half Winner',
      outcomes: [
        { name: homeTeam, price: h1 },
        { name: awayTeam, price: a1 }
      ]
    });
    
    return markets;
  }
  
  /**
   * Generate markets for Baseball
   */
  private generateBaseballMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Total Runs
    const totals = [7.5, 8.5, 9.5, 10.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Runs`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Run Line
    const runLines = [-1.5, -2.5];
    runLines.forEach(line => {
      const [home, away] = this.generateBalancedOdds(2);
      markets.push({
        key: `run_line_${line}`,
        name: `Run Line`,
        description: `${line > 0 ? '+' : ''}${line}`,
        outcomes: [
          { name: homeTeam, price: home, point: line },
          { name: awayTeam, price: away, point: -line }
        ]
      });
    });
    
    // First Inning Winner
    const [h1, a1, none] = this.generateBalancedOdds(3);
    markets.push({
      key: '1st_inning',
      name: '1st Inning Winner',
      outcomes: [
        { name: homeTeam, price: h1 },
        { name: awayTeam, price: a1 },
        { name: 'No Runs', price: none }
      ]
    });
    
    return markets;
  }
  
  /**
   * Generate markets for Ice Hockey
   */
  private generateIceHockeyMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Total Goals
    const totals = [4.5, 5.5, 6.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Goals`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Puck Line
    const puckLines = [-1.5, -2.5];
    puckLines.forEach(line => {
      const [home, away] = this.generateBalancedOdds(2);
      markets.push({
        key: `puck_line_${line}`,
        name: `Puck Line`,
        description: `${line > 0 ? '+' : ''}${line}`,
        outcomes: [
          { name: homeTeam, price: home, point: line },
          { name: awayTeam, price: away, point: -line }
        ]
      });
    });
    
    // Both Teams To Score
    const [yes, no] = this.generateBalancedOdds(2);
    markets.push({
      key: 'btts',
      name: 'Both Teams To Score',
      outcomes: [
        { name: 'Yes', price: yes },
        { name: 'No', price: no }
      ]
    });
    
    // Period Winners
    for (let p = 1; p <= 3; p++) {
      const [h, d, a] = this.generateBalancedOdds(3);
      markets.push({
        key: `${p}p_result`,
        name: `${p}${p === 1 ? 'st' : p === 2 ? 'nd' : 'rd'} Period Result`,
        outcomes: [
          { name: homeTeam, price: h },
          { name: 'Draw', price: d },
          { name: awayTeam, price: a }
        ]
      });
    }
    
    // Double Chance
    const [dc1, dc2, dc3] = this.generateBalancedOdds(3);
    markets.push({
      key: 'double_chance',
      name: 'Double Chance',
      outcomes: [
        { name: `${homeTeam} or Draw`, price: dc1 },
        { name: `${awayTeam} or Draw`, price: dc2 },
        { name: `${homeTeam} or ${awayTeam}`, price: dc3 }
      ]
    });
    
    return markets;
  }
  
  /**
   * Generate markets for Cricket
   */
  private generateCricketMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Total Runs
    const totals = [250.5, 275.5, 300.5, 325.5];
    totals.forEach(total => {
      const [over, under] = this.generateBalancedOdds(2);
      markets.push({
        key: `totals_${total}`,
        name: `Total Runs`,
        description: `Over/Under ${total}`,
        outcomes: [
          { name: `Over ${total}`, price: over },
          { name: `Under ${total}`, price: under }
        ]
      });
    });
    
    // Top Batsman
    const players = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Other'];
    markets.push({
      key: 'top_batsman',
      name: 'Top Batsman',
      outcomes: players.map(player => ({
        name: player,
        price: this.generateOdds(3, 8)
      }))
    });
    
    // Top Bowler
    markets.push({
      key: 'top_bowler',
      name: 'Top Bowler',
      outcomes: players.map(player => ({
        name: player,
        price: this.generateOdds(3, 8)
      }))
    });
    
    return markets;
  }
  
  /**
   * Generate markets for MMA
   */
  private generateMMAMarkets(homeTeam: string, awayTeam: string): Market[] {
    const markets: Market[] = [];
    
    // Method of Victory
    const methods = ['KO/TKO', 'Submission', 'Decision', 'Draw'];
    const homeVictory = methods.map(method => ({
      name: `${homeTeam} by ${method}`,
      price: this.generateOdds(2, 10)
    }));
    const awayVictory = methods.map(method => ({
      name: `${awayTeam} by ${method}`,
      price: this.generateOdds(2, 10)
    }));
    
    markets.push({
      key: 'method_of_victory',
      name: 'Method of Victory',
      outcomes: [...homeVictory, ...awayVictory]
    });
    
    // Total Rounds
    const [over, under] = this.generateBalancedOdds(2);
    markets.push({
      key: 'total_rounds',
      name: 'Total Rounds',
      description: 'Over/Under 2.5',
      outcomes: [
        { name: 'Over 2.5', price: over },
        { name: 'Under 2.5', price: under }
      ]
    });
    
    // Fight to Go Distance
    const [yes, no] = this.generateBalancedOdds(2);
    markets.push({
      key: 'go_distance',
      name: 'Fight to Go Distance',
      outcomes: [
        { name: 'Yes', price: yes },
        { name: 'No', price: no }
      ]
    });
    
    return markets;
  }
  
  /**
   * Main method to generate all markets for a match
   * Uses deterministic seeding for consistent odds
   */
  generateMarkets(sportKey: string, homeTeam: string, awayTeam: string, matchId?: string): Market[] {
    // Validate inputs
    if (!sportKey || !homeTeam || !awayTeam) {
      console.error('MarketGenerator.generateMarkets: Missing required parameters', {
        sportKey,
        homeTeam,
        awayTeam,
        matchId
      });
      return [];
    }

    // Initialize RNG with seed based on match details
    const seed = matchId || `${sportKey}-${homeTeam}-${awayTeam}`;
    this.rng = this.seedRandom(seed);
    
    switch (sportKey.toLowerCase()) {
      case 'football':
      case 'soccer':
        return this.generateFootballMarkets(homeTeam, awayTeam);
      
      case 'basketball':
        return this.generateBasketballMarkets(homeTeam, awayTeam);
      
      case 'americanfootball':
        return this.generateAmericanFootballMarkets(homeTeam, awayTeam);
      
      case 'baseball':
        return this.generateBaseballMarkets(homeTeam, awayTeam);
      
      case 'icehockey':
        return this.generateIceHockeyMarkets(homeTeam, awayTeam);
      
      case 'cricket':
        return this.generateCricketMarkets(homeTeam, awayTeam);
      
      case 'mma':
        return this.generateMMAMarkets(homeTeam, awayTeam);
      
      default:
        return [];
    }
  }
}

export const marketGenerator = new MarketGenerator();
