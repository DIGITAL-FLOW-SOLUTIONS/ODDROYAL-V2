import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowUpRight, 
  History,
  Clock,
  CreditCard,
  Smartphone,
  DollarSign,
  Wallet as WalletIcon
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface Transaction {
  id: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

function Withdrawal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('KES');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [walletNumber, setWalletNumber] = useState('');
  const { user, isAuthenticated, isLoading } = useAuth();
  
  const { data: transactionsResponse } = useQuery<{ success: boolean; data: Transaction[] }>({
    queryKey: ['/api/transactions'],
    enabled: !!localStorage.getItem('authToken')
  });

  const transactionsData = transactionsResponse?.data || [];
  const withdrawalHistory = transactionsData.filter(t => t.type === 'withdrawal').slice(0, 10);

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/api/wallet/withdraw', { 
        amount: amount.toString(),
        currency: selectedCurrency,
        paymentMethod: selectedPaymentMethod,
        walletNumber: walletNumber 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      setWithdrawAmount('');
      setSelectedPaymentMethod('');
      setWalletNumber('');
      toast({
        title: "Withdrawal Successful",
        description: `Successfully withdrew ${selectedCurrency} ${withdrawAmount}`
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

  const paymentMethods = [
    {
      value: 'visa-mastercard',
      label: 'Visa/MasterCard',
      icon: CreditCard,
      description: 'Credit/Debit Card'
    },
    {
      value: 'mpesa',
      label: 'M-PESA',
      icon: Smartphone,
      description: 'Mobile Money'
    },
    {
      value: 'bank-transfer',
      label: 'Bank Transfer',
      icon: DollarSign,
      description: 'Direct Bank Transfer'
    }
  ];

  const currencies = [
    { code: 'KES', name: 'Kenyan Shilling' },
    { code: 'TZS', name: 'Tanzanian Shilling' },
    { code: 'UGX', name: 'Ugandan Shilling' },
    { code: 'USD', name: 'US Dollar' }
  ];

  const handleWithdraw = () => {
    if (!selectedPaymentMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please select a payment method to continue.",
        variant: "destructive"
      });
      return;
    }

    if (!walletNumber.trim()) {
      toast({
        title: "Account Details Required",
        description: "Please enter your wallet/card number.",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(withdrawAmount);
    const availableBalance = parseFloat(user?.balance || '0');
    
    if (amount > 0 && amount <= availableBalance) {
      withdrawMutation.mutate(amount);
    } else if (amount > availableBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Withdrawal amount exceeds available balance.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
        </motion.div>
      </div>
    );
  }

  if (!localStorage.getItem('authToken')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold mb-4">Please log in to make a withdrawal</h2>
          <Button onClick={() => setLocation('/login')}>
            Go to Login
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <h1 className="text-4xl font-bold">Withdrawal</h1>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Balance: </span>
              <span className="font-semibold">
                {user ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(user.balance))) : '0.00'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Withdrawal balance: </span>
              <span className="font-semibold">
                {user ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(user.balance))) : '0.00'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Withdrawal Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
                Withdraw Funds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount Input */}
              <div>
                <Label htmlFor="withdraw-amount">Enter the withdrawal amount</Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  placeholder="Enter amount to withdraw"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="1"
                  max={user ? user.balance : "0"}
                  className="text-lg h-12"
                  data-testid="input-withdraw-amount"
                />
              </div>

              {/* Payment Method and Currency */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                    <SelectTrigger className="h-12" data-testid="select-payment-method">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          <div className="flex items-center gap-2">
                            <method.icon className="h-4 w-4" />
                            {method.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                    <SelectTrigger className="h-12" data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Wallet/Card Number */}
              <div>
                <Label htmlFor="wallet-number">Wallet / card number</Label>
                <Input
                  id="wallet-number"
                  type="text"
                  placeholder="Enter your wallet or card number"
                  value={walletNumber}
                  onChange={(e) => setWalletNumber(e.target.value)}
                  className="text-lg h-12"
                  data-testid="input-wallet-number"
                />
              </div>

              {/* Withdraw Button */}
              <Button 
                className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
                onClick={handleWithdraw}
                disabled={
                  !withdrawAmount || 
                  parseFloat(withdrawAmount) <= 0 || 
                  parseFloat(withdrawAmount) > parseFloat(user?.balance || '0') ||
                  !selectedPaymentMethod ||
                  !walletNumber.trim() ||
                  withdrawMutation.isPending
                }
                data-testid="button-withdraw"
              >
                {withdrawMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <WalletIcon className="h-4 w-4 mr-2" />
                    Withdraw
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                * This is a demo platform. No real money will be processed.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {withdrawalHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No withdrawal history found</p>
              ) : (
                <div className="space-y-3">
                  {withdrawalHistory.map((transaction, index) => (
                    <motion.div
                      key={transaction.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex justify-between items-center py-3 border-b last:border-b-0"
                      data-testid={`withdrawal-history-${transaction.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                          <ArrowUpRight className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-red-600">
                          -{currencyUtils.formatCurrency(Math.abs(parseInt(transaction.amount)))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Balance: {currencyUtils.formatCurrency(parseInt(transaction.balanceAfter))}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default Withdrawal;