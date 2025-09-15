import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Trophy, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  History,
  Star,
  User,
  CreditCard
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";

interface Bet {
  id: string;
  type: string;
  totalStake: string;
  potentialWinnings: string;
  totalOdds: string;
  status: string;
  placedAt: string;
  selections: Array<{
    homeTeam: string;
    awayTeam: string;
    league: string;
    market: string;
    selection: string;
    odds: string;
  }>;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

interface Favorite {
  id: string;
  entityId: string;
  entityType: string;
  name: string;
  createdAt: string;
}

function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  
  const { data: betsData = [] } = useQuery<Bet[]>({
    queryKey: ['/api/bets'],
    enabled: isAuthenticated
  });

  const { data: transactionsData = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
    enabled: isAuthenticated
  });

  const { data: favoritesData = [] } = useQuery<Favorite[]>({
    queryKey: ['/api/favorites'],
    enabled: isAuthenticated
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Loading dashboard...</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Please log in to view your dashboard</h2>
            <Button onClick={() => setLocation('/login')} data-testid="button-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalBets = betsData.length;
  const activeBets = betsData.filter(bet => bet.status === 'pending').length;
  const wonBets = betsData.filter(bet => bet.status === 'won').length;
  const totalStaked = betsData.reduce((sum, bet) => sum + parseFloat(bet.totalStake), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.username}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Account Balance</p>
          <p className="text-2xl font-bold" data-testid="text-balance">
            {currencyUtils.formatCurrency(parseFloat(user.balance))}
          </p>
        </div>
      </div>

      {/* Account Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bets">{totalBets}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bets</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-bets">{activeBets}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won Bets</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-won-bets">{wonBets}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staked</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-staked">
              {currencyUtils.formatCurrency(totalStaked)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Tabs */}
      <Tabs defaultValue="bets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bets" data-testid="tab-bets">
            <History className="h-4 w-4 mr-2" />
            Bet History
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            <CreditCard className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="favorites" data-testid="tab-favorites">
            <Star className="h-4 w-4 mr-2" />
            Favorites
          </TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-account">
            <User className="h-4 w-4 mr-2" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bets" className="space-y-4">
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList>
              <TabsTrigger value="active" data-testid="tab-active-bets">
                Active Bets ({activeBets})
              </TabsTrigger>
              <TabsTrigger value="settled" data-testid="tab-settled-bets">
                Settled Bets ({wonBets + betsData.filter(bet => bet.status === 'lost').length})
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all-bets">
                All Bets ({totalBets})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Active Bets</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeBets === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No active bets</p>
                  ) : (
                    <div className="space-y-4">
                      {betsData.filter(bet => bet.status === 'pending').map((bet) => (
                        <div key={bet.id} className="border rounded-lg p-4" data-testid={`bet-card-${bet.id}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <Badge variant="secondary">
                                PENDING
                              </Badge>
                              <Badge variant="outline" className="ml-2">
                                {bet.type.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                Stake: {currencyUtils.formatCurrency(parseFloat(bet.totalStake))}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Potential: {currencyUtils.formatCurrency(parseFloat(bet.potentialWinnings))}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {bet.selections.map((selection, index) => (
                              <div key={index} className="text-sm">
                                <div className="font-medium">{selection.homeTeam} vs {selection.awayTeam}</div>
                                <div className="text-muted-foreground">
                                  {selection.league} • {selection.market}: {selection.selection} @ {selection.odds}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="flex justify-between items-center mt-3 pt-3 border-t">
                            <span className="text-sm text-muted-foreground">
                              Placed: {new Date(bet.placedAt).toLocaleDateString()}
                            </span>
                            <span className="font-medium">
                              Total Odds: {bet.totalOdds}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settled" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Settled Bets</CardTitle>
                </CardHeader>
                <CardContent>
                  {betsData.filter(bet => bet.status !== 'pending').length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No settled bets</p>
                  ) : (
                    <div className="space-y-4">
                      {betsData.filter(bet => bet.status !== 'pending').map((bet) => (
                        <div key={bet.id} className="border rounded-lg p-4" data-testid={`bet-card-${bet.id}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <Badge variant={bet.status === 'won' ? 'default' : 'destructive'}>
                                {bet.status.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="ml-2">
                                {bet.type.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                Stake: {currencyUtils.formatCurrency(parseFloat(bet.totalStake))}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {bet.status === 'won' ? 'Won: ' : 'Potential: '}
                                {currencyUtils.formatCurrency(parseFloat(bet.potentialWinnings))}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {bet.selections.map((selection, index) => (
                              <div key={index} className="text-sm">
                                <div className="font-medium">{selection.homeTeam} vs {selection.awayTeam}</div>
                                <div className="text-muted-foreground">
                                  {selection.league} • {selection.market}: {selection.selection} @ {selection.odds}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="flex justify-between items-center mt-3 pt-3 border-t">
                            <span className="text-sm text-muted-foreground">
                              Placed: {new Date(bet.placedAt).toLocaleDateString()}
                            </span>
                            <span className="font-medium">
                              Total Odds: {bet.totalOdds}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>All Bets</CardTitle>
                </CardHeader>
                <CardContent>
                  {betsData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No bets placed yet</p>
                  ) : (
                    <div className="space-y-4">
                      {betsData.map((bet) => (
                        <div key={bet.id} className="border rounded-lg p-4" data-testid={`bet-card-${bet.id}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <Badge variant={bet.status === 'won' ? 'default' : bet.status === 'lost' ? 'destructive' : 'secondary'}>
                                {bet.status.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="ml-2">
                                {bet.type.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                Stake: {currencyUtils.formatCurrency(parseFloat(bet.totalStake))}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Potential: {currencyUtils.formatCurrency(parseFloat(bet.potentialWinnings))}
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {bet.selections.map((selection, index) => (
                              <div key={index} className="text-sm">
                                <div className="font-medium">{selection.homeTeam} vs {selection.awayTeam}</div>
                                <div className="text-muted-foreground">
                                  {selection.league} • {selection.market}: {selection.selection} @ {selection.odds}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="flex justify-between items-center mt-3 pt-3 border-t">
                            <span className="text-sm text-muted-foreground">
                              Placed: {new Date(bet.placedAt).toLocaleDateString()}
                            </span>
                            <span className="font-medium">
                              Total Odds: {bet.totalOdds}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactionsData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No transactions yet</p>
              ) : (
                <div className="space-y-3">
                  {transactionsData.slice(0, 20).map((transaction) => (
                    <div key={transaction.id} className="flex justify-between items-center py-2 border-b" data-testid={`transaction-${transaction.id}`}>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${transaction.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                          {transaction.amount.startsWith('-') ? '-' : '+'}
                          {currencyUtils.formatCurrency(Math.abs(parseFloat(transaction.amount)))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance: {currencyUtils.formatCurrency(parseFloat(transaction.balanceAfter))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="favorites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Favorites</CardTitle>
            </CardHeader>
            <CardContent>
              {favoritesData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No favorites added yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favoritesData.map((favorite) => (
                    <Card key={favorite.id} data-testid={`favorite-${favorite.id}`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{favorite.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {favorite.entityType}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" data-testid={`button-remove-favorite-${favorite.id}`}>
                            <Star className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Username</label>
                  <p className="text-lg" data-testid="text-username">{user.username}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <p className="text-lg" data-testid="text-email">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Account Status</label>
                  <Badge variant="default" data-testid="badge-status">
                    Active
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Member Since</label>
                  <p className="text-lg" data-testid="text-member-since">
                    Account created
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex gap-4">
                <Button variant="outline" data-testid="button-change-password">
                  Change Password
                </Button>
                <Button variant="outline" data-testid="button-update-profile">
                  Update Profile
                </Button>
                <Button variant="destructive" data-testid="button-logout">
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Dashboard;