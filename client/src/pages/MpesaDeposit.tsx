import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Smartphone,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Building2,
  User,
  Receipt,
  History,
  XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { currencyUtils } from "@shared/schema";

type PaymentStatus = 'idle' | 'initiating' | 'awaiting_pin' | 'checking' | 'success' | 'failed';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  description: string;
  metadata?: string;
}

function MpesaDeposit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const urlParams = new URLSearchParams(window.location.search);
  const [amount] = useState(urlParams.get('amount') || localStorage.getItem('mpesa_amount') || '2000');
  const [currency] = useState(urlParams.get('currency') || localStorage.getItem('mpesa_currency') || 'KES');
  const [mobileNumber, setMobileNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [depositId, setDepositId] = useState<string>(() => {
    // Generate a random 6-digit numeric deposit ID with timestamp for uniqueness
    return (100000 + (Date.now() % 900000)).toString();
  });
  const [transactionId, setTransactionId] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [depositDate] = useState(new Date());

  // Fetch M-PESA configuration with error handling
  const { data: mpesaConfig, isLoading: configLoading, error: configError } = useQuery<{
    success: boolean;
    data: { shortcode: string };
  }>({
    queryKey: ['/api/mpesa/config']
  });

  const paybillNumber = mpesaConfig?.data?.shortcode || '';

  const formatMobileNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');

    if (digits.startsWith('0')) {
      return `254${digits.slice(1)}`;
    } else if (digits.startsWith('254')) {
      return digits;
    } else if (digits.startsWith('7') || digits.startsWith('1')) {
      return `254${digits}`;
    }
    return digits;
  };

  const handleMobileNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatMobileNumber(e.target.value);
    setMobileNumber(formatted);
  };

  const validateMobileNumber = (number: string) => {
    const regex = /^254[17]\d{8}$/;
    return regex.test(number);
  };

  const { data: transactionsResponse } = useQuery<{
    success: boolean;
    data: Transaction[];
  }>({
    queryKey: ['/api/transactions'],
    enabled: !!user
  });

  const transactionsData = transactionsResponse?.data || [];
  
  const depositTransactions = transactionsData
    .filter(t => t.type === 'deposit')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const mpesaPaymentMutation = useMutation({
    mutationFn: async (paymentDepositId: string) => {
      const response = await apiRequest('POST', '/api/mpesa/stk-push', {
        phoneNumber: mobileNumber,
        amount: parseInt(amount),
        currency,
        description: `Deposit to ${user?.username || 'account'}`,
        depositId: paymentDepositId
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setTransactionId(data.data.CheckoutRequestID);
        // Update depositId with the authoritative value from backend
        if (data.data.depositId) {
          setDepositId(data.data.depositId);
        }
        queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        setPaymentStatus('awaiting_pin');
        setCountdown(15);
        pollPaymentStatus(data.data.CheckoutRequestID);
        toast({
          title: "Success! Payment Request Sent",
          description: `STK Push sent to ${mobileNumber}. Check your phone and enter your M-PESA PIN to complete the payment.`
        });
      } else {
        setPaymentStatus('failed');
        toast({
          title: "Payment Failed",
          description: data.message || "Unable to initiate payment",
          variant: "destructive"
        });
      }
    },
    onError: () => {
      setPaymentStatus('failed');
      toast({
        title: "Payment Failed",
        description: "Network error. Please try again.",
        variant: "destructive"
      });
    }
  });

  const pollPaymentStatus = async (checkoutRequestID: string) => {
    const maxAttempts = 24;
    let attempts = 0;
    const INITIAL_DELAY = 15000;
    const POLL_INTERVAL = 5000;

    const checkStatus = async () => {
      if (attempts > 0) {
        setPaymentStatus('checking');
      }

      try {
        const response = await apiRequest('GET', `/api/mpesa/payment-status/${checkoutRequestID}`);
        const data: any = await response.json();

        if (data.success) {
          if (data.data.status === 'completed') {
            setPaymentStatus('success');
            setCountdown(0);
            toast({
              title: "Payment Successful",
              description: `Successfully deposited ${currency} ${parseInt(amount).toLocaleString()}`
            });
            queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
            queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
            setTimeout(() => {
              setLocation('/deposit');
            }, 3000);
            return;
          } else if (data.data.status === 'failed') {
            setPaymentStatus('failed');
            setCountdown(0);
            toast({
              title: "Payment Failed",
              description: data.data.message || "Payment was not completed. You may have cancelled or entered wrong PIN.",
              variant: "destructive"
            });
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, POLL_INTERVAL);
        } else {
          setPaymentStatus('failed');
          setCountdown(0);
          toast({
            title: "Transaction Timeout",
            description: "Payment verification timed out. Please check your M-PESA messages or try again.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Status check error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, POLL_INTERVAL);
        } else {
          setPaymentStatus('failed');
          setCountdown(0);
          toast({
            title: "Connection Error",
            description: "Unable to verify payment. Please check your M-PESA messages.",
            variant: "destructive"
          });
        }
      }
    };

    setTimeout(checkStatus, INITIAL_DELAY);
  };

  const handleSubmit = () => {
    if (!validateMobileNumber(mobileNumber)) {
      toast({
        title: "Invalid Mobile Number",
        description: "Please enter a valid Kenyan mobile number",
        variant: "destructive"
      });
      return;
    }

    // Generate new depositId for each payment attempt with timestamp and randomness for uniqueness
    const newDepositId = (100000 + ((Date.now() + Math.floor(Math.random() * 1000)) % 900000)).toString();
    setDepositId(newDepositId);
    
    setPaymentStatus('initiating');
    toast({
      title: "Payment Initializing...",
      description: "Please wait while we process your request"
    });
    // Pass the new depositId directly to mutation to avoid async state issues
    mpesaPaymentMutation.mutate(newDepositId);
  };

  useEffect(() => {
    if (countdown > 0 && paymentStatus === 'awaiting_pin') {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, paymentStatus]);

  useEffect(() => {
    localStorage.removeItem('mpesa_amount');
    localStorage.removeItem('mpesa_currency');
  }, []);

  const getStatusBadge = () => {
    switch (paymentStatus) {
      case 'initiating':
        return <Badge variant="secondary" data-testid="badge-status"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Initiating</Badge>;
      case 'awaiting_pin':
        return <Badge variant="secondary" className="bg-blue-600 text-white" data-testid="badge-status"><Clock className="h-3 w-3 mr-1" />Awaiting PIN</Badge>;
      case 'checking':
        return <Badge variant="secondary" className="bg-blue-600 text-white" data-testid="badge-status"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Checking</Badge>;
      case 'success':
        return <Badge variant="secondary" className="bg-green-600 text-white" data-testid="badge-status"><CheckCircle className="h-3 w-3 mr-1" />Successful</Badge>;
      case 'failed':
        return <Badge variant="destructive" data-testid="badge-status"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary" data-testid="badge-status"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 md:p-6 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-6"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/deposit')}
            className="hover-elevate"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">M-PESA Deposit</h1>
            <p className="text-sm text-muted-foreground">Secure mobile money transfer</p>
          </div>
        </motion.div>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 flex flex-col">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="order-2 lg:order-1 relative z-0"
            >
              <Card data-testid="card-deposit-details">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Receipt className="h-5 w-5" />
                      Deposit #{depositId || '------'}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {depositDate.toLocaleDateString('en-KE', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                  {getStatusBadge()}
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        Pay To
                      </h3>
                      <div className="space-y-1 text-sm">
                        <p className="font-medium" data-testid="text-business-name">OddRoyal</p>
                        <p className="text-muted-foreground">M-PESA Paybill</p>
                        <p className="text-muted-foreground">
                          Paybill Number: {' '}
                          {configLoading ? (
                            <Loader2 className="h-3 w-3 inline animate-spin" />
                          ) : paybillNumber ? (
                            <span className="font-mono font-semibold text-foreground" data-testid="text-paybill">{paybillNumber}</span>
                          ) : (
                            <span className="text-destructive text-xs">Not available</span>
                          )}
                        </p>
                        <p className="text-muted-foreground">Nairobi, Kenya</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        Deposit To
                      </h3>
                      <div className="space-y-1 text-sm">
                        <p className="font-medium" data-testid="text-username">{user?.username || 'Your Account'}</p>
                        <p className="text-muted-foreground">{user?.email || ''}</p>
                        <p className="text-muted-foreground">Account Balance: <span className="font-semibold text-foreground">KES {(Number(user?.balance) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-4">Deposit Info</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm" data-testid="row-deposit-amount">
                        <span className="text-muted-foreground">Deposit Amount</span>
                        <span className="font-semibold">{currency} {parseInt(amount).toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold text-lg" data-testid="row-total">
                        <span>Total</span>
                        <span className="text-primary">{currency} {parseInt(amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {depositTransactions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="order-3 lg:order-2 relative z-0"
              >
                <Card data-testid="card-transactions">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Recent Transactions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {depositTransactions.map((transaction, index) => {
                        let metadata;
                        try {
                          metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};
                        } catch {
                          metadata = {};
                        }
                        
                        return (
                          <motion.div
                            key={transaction.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-center justify-between p-3 rounded-lg hover-elevate"
                            data-testid={`transaction-${transaction.id}`}
                          >
                            <div className="flex items-center gap-3">
                              {transaction.status === 'completed' ? (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              ) : transaction.status === 'failed' ? (
                                <XCircle className="h-5 w-5 text-red-600" />
                              ) : (
                                <Clock className="h-5 w-5 text-blue-600" />
                              )}
                              <div>
                                <p className="text-sm font-medium" data-testid={`text-transaction-desc-${transaction.id}`}>
                                  Deposit #{metadata.depositId || transaction.id.substring(0, 6)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(transaction.createdAt).toLocaleString('en-KE', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold" data-testid={`text-transaction-amount-${transaction.id}`}>
                                KES {transaction.amount.toLocaleString()}
                              </p>
                              <Badge
                                variant={
                                  transaction.status === 'completed' ? 'secondary' :
                                  transaction.status === 'failed' ? 'destructive' :
                                  'secondary'
                                }
                                className={
                                  transaction.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                                  transaction.status === 'failed' ? '' :
                                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                                }
                                data-testid={`badge-transaction-status-${transaction.id}`}
                              >
                                {transaction.status}
                              </Badge>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          <div className="space-y-6 order-1 lg:order-3">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="lg:sticky lg:top-6 relative z-0"
            >
              <Card className="bg-primary/5 border-primary/20" data-testid="card-payment">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-3 p-4 bg-primary/10 rounded-full w-fit">
                    <Smartphone className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">
                    Total Due
                  </CardTitle>
                  <p className="text-4xl font-bold text-primary mt-2" data-testid="text-total-amount">
                    {currency} {parseInt(amount).toLocaleString()}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AnimatePresence mode="wait">
                    {paymentStatus === 'initiating' && (
                      <motion.div
                        key="initiating"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="text-center py-6 space-y-4"
                      >
                        <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin" />
                        <div>
                          <p className="font-semibold text-lg">Sending STK Push...</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Initiating payment request to {mobileNumber}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {paymentStatus === 'idle' && (
                      <motion.div
                        key="form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4"
                      >
                        <div>
                          <Label htmlFor="mobile" className="text-sm font-medium">
                            M-PESA Mobile Number
                          </Label>
                          <Input
                            id="mobile"
                            type="tel"
                            placeholder="254712345678"
                            value={mobileNumber}
                            onChange={handleMobileNumberChange}
                            className="mt-1.5 h-11"
                            maxLength={12}
                            data-testid="input-mobile-number"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Enter your Safaricom number
                          </p>
                        </div>

                        <Button
                          onClick={handleSubmit}
                          disabled={!mobileNumber || !validateMobileNumber(mobileNumber)}
                          className="w-full h-11 text-base font-semibold"
                          size="lg"
                          data-testid="button-pay-now"
                        >
                          <Smartphone className="h-4 w-4 mr-2" />
                          Pay Now
                        </Button>

                        <Separator className="my-4" />

                        <div className="space-y-3 text-sm bg-card p-4 rounded-lg border">
                          <p className="font-semibold text-center mb-2">Manual Payment Instructions</p>
                          {configLoading ? (
                            <div className="text-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                              <p className="text-xs text-muted-foreground mt-2">Loading payment details...</p>
                            </div>
                          ) : configError || !paybillNumber ? (
                            <div className="text-center py-4">
                              <AlertCircle className="h-4 w-4 mx-auto text-destructive mb-2" />
                              <p className="text-xs text-destructive">Unable to load paybill number. Please try again.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div>
                                <p className="text-muted-foreground text-xs">1. Enter business no:</p>
                                <p className="font-mono font-bold text-primary text-lg" data-testid="text-manual-paybill">{paybillNumber}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">2. Enter account no:</p>
                                <p className="font-mono font-bold text-primary text-lg" data-testid="text-manual-account">{depositId}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">3. Enter amount:</p>
                                <p className="font-mono font-bold text-primary text-lg" data-testid="text-manual-amount">{parseInt(amount).toLocaleString()} KES</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {(paymentStatus === 'awaiting_pin' || paymentStatus === 'checking') && (
                      <motion.div
                        key="waiting"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="text-center py-6 space-y-4"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          {paymentStatus === 'awaiting_pin' ? (
                            <Smartphone className="h-16 w-16 mx-auto text-primary" />
                          ) : (
                            <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin" />
                          )}
                        </motion.div>
                        <div>
                          <p className="font-semibold text-lg">
                            {paymentStatus === 'awaiting_pin' ? 'Check Your Phone' : 'Verifying Payment'}
                          </p>
                          {countdown > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Enter PIN ({countdown}s)
                            </p>
                          )}
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <p className="text-sm text-blue-900 dark:text-blue-100">
                            {paymentStatus === 'awaiting_pin'
                              ? `Enter your M-PESA PIN on your phone (${mobileNumber}) to complete the transaction`
                              : 'Verifying payment with M-PESA. Please wait...'}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {paymentStatus === 'success' && (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="text-center py-6 space-y-4"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        >
                          <CheckCircle className="h-20 w-20 mx-auto text-green-600" />
                        </motion.div>
                        <div>
                          <p className="font-bold text-xl text-green-600">Payment Successful!</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your deposit has been processed
                          </p>
                        </div>
                        <Button
                          onClick={() => setLocation('/deposit')}
                          variant="outline"
                          className="w-full"
                          data-testid="button-view-balance"
                        >
                          View Account Balance
                        </Button>
                      </motion.div>
                    )}

                    {paymentStatus === 'failed' && (
                      <motion.div
                        key="failed"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="text-center py-6 space-y-4"
                      >
                        <AlertCircle className="h-20 w-20 mx-auto text-red-600" />
                        <div>
                          <p className="font-bold text-xl text-red-600">Payment Failed</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            The transaction was not completed
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setPaymentStatus('idle');
                            setTransactionId('');
                          }}
                          className="w-full"
                          data-testid="button-try-again"
                        >
                          Try Again
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {transactionId && (
                    <div className="text-center text-xs text-muted-foreground border-t pt-3">
                      <p>Transaction ID</p>
                      <p className="font-mono text-xs mt-1" data-testid="text-transaction-id">{transactionId.substring(0, 20)}...</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-4 text-center text-xs text-muted-foreground space-y-1"
              >
                <p>🔒 Secured by Safaricom M-PESA</p>
                <p>You will receive an SMS confirmation</p>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MpesaDeposit;
