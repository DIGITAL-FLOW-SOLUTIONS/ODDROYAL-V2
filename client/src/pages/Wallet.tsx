import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wallet as WalletIcon, 
  Plus, 
  Minus, 
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  TrendingUp,
  TrendingDown,
  DollarSign
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface UserProfile {
  id: string;
  username: string;
  email: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
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

function Wallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  
  const { data: userProfile, isLoading } = useQuery<UserProfile>({
    queryKey: ['/api/auth/me'],
    enabled: !!localStorage.getItem('authToken')
  });

  const { data: transactionsData = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
    enabled: !!localStorage.getItem('authToken')
  });

  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/api/wallet/deposit', { amount: amount.toString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      const amountInCents = currencyUtils.poundsToCents(parseFloat(depositAmount));
      setDepositAmount('');
      toast({
        title: "Deposit Successful",
        description: `Successfully deposited ${currencyUtils.formatCurrency(amountInCents)}`
      });
    },
    onError: () => {
      toast({
        title: "Deposit Failed",
        description: "Failed to process deposit. Please try again.",
        variant: "destructive"
      });
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/api/wallet/withdraw', { amount: amount.toString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      const amountInCents = currencyUtils.poundsToCents(parseFloat(withdrawAmount));
      setWithdrawAmount('');
      toast({
        title: "Withdrawal Successful",
        description: `Successfully withdrew ${currencyUtils.formatCurrency(amountInCents)}`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Failed",
        description: error?.message || "Failed to process withdrawal. Please try again.",
        variant: "destructive"
      });
    }
  });

  if (!userProfile && !isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Please log in to access your wallet</h2>
            <Button onClick={() => setLocation('/login')} data-testid="button-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p>Loading wallet...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (amount > 0) {
      depositMutation.mutate(amount);
    }
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (amount > 0) {
      withdrawMutation.mutate(amount);
    }
  };

  const recentTransactions = transactionsData.slice(0, 10);
  const totalDeposits = transactionsData
    .filter(t => t.type === 'deposit')
    .reduce((sum, t) => sum + parseInt(t.amount), 0); // amount is in cents
  const totalWithdrawals = transactionsData
    .filter(t => t.type === 'withdrawal')
    .reduce((sum, t) => sum + Math.abs(parseInt(t.amount)), 0); // amount is in cents

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <WalletIcon className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-wallet-title">Wallet</h1>
            <p className="text-muted-foreground">Manage your account balance</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Current Balance</p>
          <p className="text-3xl font-bold text-green-600" data-testid="text-wallet-balance">
            {userProfile ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(userProfile.balance))) : ''}
          </p>
        </div>
      </div>

      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-balance">
              {userProfile ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(userProfile.balance))) : ''}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deposits</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-total-deposits">
              {currencyUtils.formatCurrency(totalDeposits)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Withdrawals</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-total-withdrawals">
              {currencyUtils.formatCurrency(totalWithdrawals)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="actions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="actions" data-testid="tab-actions">
            <CreditCard className="h-4 w-4 mr-2" />
            Deposit & Withdraw
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            Transaction History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Deposit Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ArrowDownLeft className="h-5 w-5 text-green-600" />
                  <span>Deposit Funds</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Amount</label>
                  <Input
                    type="number"
                    placeholder="Enter amount to deposit"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min="1"
                    step="0.01"
                    data-testid="input-deposit-amount"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDepositAmount('10')}
                    data-testid="button-deposit-10"
                  >
                    £10
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDepositAmount('25')}
                    data-testid="button-deposit-25"
                  >
                    £25
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDepositAmount('50')}
                    data-testid="button-deposit-50"
                  >
                    £50
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDepositAmount('100')}
                    data-testid="button-deposit-100"
                  >
                    £100
                  </Button>
                </div>
                <Button 
                  className="w-full"
                  onClick={handleDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0 || depositMutation.isPending}
                  data-testid="button-deposit"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {depositMutation.isPending ? "Processing..." : "Deposit Funds"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  * This is a demo platform. No real money will be processed.
                </p>
              </CardContent>
            </Card>

            {/* Withdraw Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ArrowUpRight className="h-5 w-5 text-red-600" />
                  <span>Withdraw Funds</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Amount</label>
                  <Input
                    type="number"
                    placeholder="Enter amount to withdraw"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="1"
                    max={userProfile ? userProfile.balance : "0"}
                    step="0.01"
                    data-testid="input-withdraw-amount"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Available balance: {userProfile ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(userProfile.balance))) : ''}
                </p>
                <Button 
                  className="w-full"
                  variant="destructive"
                  onClick={handleWithdraw}
                  disabled={
                    !withdrawAmount || 
                    parseFloat(withdrawAmount) <= 0 || 
                    parseFloat(withdrawAmount) > parseFloat(userProfile?.balance || '0') ||
                    withdrawMutation.isPending
                  }
                  data-testid="button-withdraw"
                >
                  <Minus className="h-4 w-4 mr-2" />
                  {withdrawMutation.isPending ? "Processing..." : "Withdraw Funds"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  * This is a demo platform. No real money will be processed.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTransactions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No transactions yet</p>
              ) : (
                <div className="space-y-3">
                  {recentTransactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="flex justify-between items-center py-3 border-b last:border-b-0" 
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          transaction.type === 'deposit' ? 'bg-green-100 text-green-600' : 
                          transaction.type === 'withdrawal' ? 'bg-red-100 text-red-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {transaction.type === 'deposit' ? (
                            <ArrowDownLeft className="h-5 w-5" />
                          ) : transaction.type === 'withdrawal' ? (
                            <ArrowUpRight className="h-5 w-5" />
                          ) : (
                            <DollarSign className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${
                          transaction.type === 'deposit' ? 'text-green-600' : 
                          transaction.type === 'withdrawal' ? 'text-red-600' :
                          transaction.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {transaction.type === 'deposit' ? '+' : 
                           transaction.type === 'withdrawal' ? '-' :
                           transaction.amount.startsWith('-') ? '' : '+'}
                          {currencyUtils.formatCurrency(Math.abs(parseInt(transaction.amount)))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance: {currencyUtils.formatCurrency(parseInt(transaction.balanceAfter))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Wallet;