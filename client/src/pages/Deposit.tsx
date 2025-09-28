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
  ArrowDownLeft, 
  CreditCard,
  Smartphone,
  DollarSign,
  Bitcoin,
  History,
  CheckCircle,
  Clock
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

function Deposit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState('2000');
  const [selectedCurrency, setSelectedCurrency] = useState('KES');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const { user, isAuthenticated, isLoading } = useAuth();
  
  const { data: transactionsResponse } = useQuery<{ success: boolean; data: Transaction[] }>({
    queryKey: ['/api/transactions'],
    enabled: !!localStorage.getItem('authToken')
  });

  const transactionsData = transactionsResponse?.data || [];
  const depositHistory = transactionsData.filter(t => t.type === 'deposit').slice(0, 10);

  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      return apiRequest('POST', '/api/wallet/deposit', { 
        amount: amount.toString(),
        currency: selectedCurrency,
        paymentMethod: selectedPaymentMethod 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      const amountInCents = currencyUtils.poundsToCents(parseFloat(depositAmount));
      setDepositAmount('2000');
      setSelectedPaymentMethod('');
      toast({
        title: "Deposit Successful",
        description: `Successfully deposited ${selectedCurrency} ${depositAmount}`
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

  const paymentMethods = [
    {
      id: 'kenya-payment',
      name: 'Kenya Payment Methods',
      icon: CreditCard,
      color: 'bg-green-500',
      description: 'Local banking methods'
    },
    {
      id: 'mpesa',
      name: 'M-PESA',
      icon: Smartphone,
      color: 'bg-green-600',
      description: 'Mobile money transfer'
    },
    {
      id: 'kes-bank',
      name: 'KES Banking',
      icon: DollarSign,
      color: 'bg-blue-500',
      description: 'Direct bank transfer'
    },
    {
      id: 'crypto',
      name: 'Cryptocurrency',
      icon: Bitcoin,
      color: 'bg-orange-500',
      description: 'Digital currency'
    }
  ];

  const currencies = [
    { code: 'KES', name: 'Kenyan Shilling' },
    { code: 'TZS', name: 'Tanzanian Shilling' },
    { code: 'UGX', name: 'Ugandan Shilling' },
    { code: 'USD', name: 'US Dollar' }
  ];

  const handleDeposit = () => {
    if (!selectedPaymentMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please select a payment method to continue.",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount >= 2000) {
      depositMutation.mutate(amount);
    } else {
      toast({
        title: "Minimum Deposit",
        description: "Minimum deposit amount is 2000.",
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
          <h2 className="text-2xl font-bold mb-4">Please log in to make a deposit</h2>
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
          className="text-center space-y-2"
        >
          <h1 className="text-4xl font-bold">Deposit Funds</h1>
          <p className="text-muted-foreground">Add money to your account securely</p>
        </motion.div>

        {/* Deposit Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownLeft className="h-5 w-5 text-green-600" />
                Balance Replenishment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount and Currency */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="amount">Deposit Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Min: 2000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min="2000"
                    className="text-lg h-12"
                    data-testid="input-deposit-amount"
                  />
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

              {/* Payment Methods */}
              <div className="space-y-4">
                <Label>Select Payment Method</Label>
                <div className="grid grid-cols-2 gap-4">
                  {paymentMethods.map((method) => (
                    <motion.div
                      key={method.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card
                        className={`cursor-pointer transition-all duration-200 ${
                          selectedPaymentMethod === method.id
                            ? 'ring-2 ring-primary bg-primary/5'
                            : 'hover-elevate'
                        }`}
                        onClick={() => setSelectedPaymentMethod(method.id)}
                        data-testid={`payment-method-${method.id}`}
                      >
                        <CardContent className="p-4 text-center space-y-3">
                          <div className={`w-12 h-12 rounded-full ${method.color} mx-auto flex items-center justify-center`}>
                            <method.icon className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{method.name}</h3>
                            <p className="text-sm text-muted-foreground">{method.description}</p>
                          </div>
                          {selectedPaymentMethod === method.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="flex justify-center"
                            >
                              <CheckCircle className="h-5 w-5 text-primary" />
                            </motion.div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Deposit Button */}
              <Button 
                className="w-full h-12 text-lg"
                onClick={handleDeposit}
                disabled={!depositAmount || parseFloat(depositAmount) < 2000 || !selectedPaymentMethod || depositMutation.isPending}
                data-testid="button-deposit"
              >
                {depositMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowDownLeft className="h-4 w-4 mr-2" />
                    Deposit {selectedCurrency} {depositAmount}
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                * This is a demo platform. No real money will be processed.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Deposit History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Deposit History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {depositHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No deposit history found</p>
              ) : (
                <div className="space-y-3">
                  {depositHistory.map((transaction, index) => (
                    <motion.div
                      key={transaction.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex justify-between items-center py-3 border-b last:border-b-0"
                      data-testid={`deposit-history-${transaction.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                          <ArrowDownLeft className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600">
                          +{currencyUtils.formatCurrency(parseInt(transaction.amount))}
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

export default Deposit;