import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DollarSign,
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

function Wallet() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: transactionsResponse } = useQuery<{
    success: boolean;
    data: Transaction[];
  }>({
    queryKey: ["/api/transactions"],
    enabled: !!localStorage.getItem("authToken"),
  });

  const transactionsData = transactionsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Loading wallet...</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!localStorage.getItem("authToken")) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Please log in to access your wallet
            </h2>
            <Button
              onClick={() => setLocation("/login")}
              data-testid="button-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Loading wallet...</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  const recentTransactions = transactionsData.slice(0, 10);
  const totalDeposits = transactionsData
    .filter((t) => t.type === "deposit")
    .reduce((sum, t) => sum + t.amount, 0); // amount is in cents
  const totalWithdrawals = transactionsData
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0); // amount is in cents

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <WalletIcon className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-wallet-title">
              Wallet
            </h1>
            <p className="text-muted-foreground">Manage your account balance</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Current Balance</p>
          <p
            className="text-3xl font-bold text-green-600"
            data-testid="text-wallet-balance"
          >
            {user
              ? currencyUtils.formatCurrency(parseInt(user.balance))
              : ""}
          </p>
        </div>
      </div>

      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Balance
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="text-current-balance"
            >
              {user
                ? currencyUtils.formatCurrency(parseInt(user.balance))
                : ""}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Deposits
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold text-green-600"
              data-testid="text-total-deposits"
            >
              {currencyUtils.formatCurrency(totalDeposits)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Withdrawals
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold text-red-600"
              data-testid="text-total-withdrawals"
            >
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
            <Card className="hover-elevate transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ArrowDownLeft className="h-5 w-5 text-green-600" />
                  <span>Deposit Funds</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Add money to your account quickly and securely using various
                  payment methods.
                </p>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/deposit")}
                  data-testid="button-go-to-deposit"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Go to Deposit Page
                </Button>
              </CardContent>
            </Card>

            {/* Withdraw Card */}
            <Card className="hover-elevate transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ArrowUpRight className="h-5 w-5 text-red-600" />
                  <span>Withdraw Funds</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Withdraw your winnings safely to your preferred payment
                  method.
                </p>
                <p className="text-sm text-muted-foreground">
                  Available balance:{" "}
                  {user
                    ? currencyUtils.formatCurrency(parseInt(user.balance))
                    : ""}
                </p>
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => setLocation("/withdrawal")}
                  data-testid="button-go-to-withdrawal"
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Go to Withdrawal Page
                </Button>
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
                <p className="text-muted-foreground text-center py-8">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-3">
                  {recentTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex justify-between items-center py-3 border-b last:border-b-0"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.type === "deposit"
                              ? "bg-green-100 text-green-600"
                              : transaction.type === "withdrawal"
                                ? "bg-red-100 text-red-600"
                                : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {transaction.type === "deposit" ? (
                            <ArrowDownLeft className="h-5 w-5" />
                          ) : transaction.type === "withdrawal" ? (
                            <ArrowUpRight className="h-5 w-5" />
                          ) : (
                            <DollarSign className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {transaction.description}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${
                            transaction.type === "deposit"
                              ? "text-green-600"
                              : transaction.type === "withdrawal"
                                ? "text-red-600"
                                : transaction.amount < 0
                                  ? "text-red-600"
                                  : "text-green-600"
                          }`}
                        >
                          {transaction.type === "deposit"
                            ? "+"
                            : transaction.type === "withdrawal"
                              ? "-"
                              : transaction.amount < 0
                                ? ""
                                : "+"}
                          {currencyUtils.formatCurrency(Math.abs(transaction.amount))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance:{" "}
                          {currencyUtils.formatCurrency(transaction.balanceAfter)}
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
