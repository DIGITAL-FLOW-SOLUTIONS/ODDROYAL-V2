import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Smartphone,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface MpesaDepositProps {
  amount?: string;
  currency?: string;
}

type PaymentStatus = 'idle' | 'initiating' | 'pending' | 'success' | 'failed';

function MpesaDeposit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Get amount and currency from URL params or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const [amount] = useState(urlParams.get('amount') || localStorage.getItem('mpesa_amount') || '2000');
  const [currency] = useState(urlParams.get('currency') || localStorage.getItem('mpesa_currency') || 'KES');
  const [mobileNumber, setMobileNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [transactionId, setTransactionId] = useState<string>('');

  // Format mobile number as user types
  const formatMobileNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as 254XXXXXXXXX
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
    // Kenyan mobile number validation (254XXXXXXXXX format)
    const regex = /^254[17]\d{8}$/;
    return regex.test(number);
  };

  const mpesaPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/mpesa/stk-push', {
        phoneNumber: mobileNumber,
        amount: parseInt(amount),
        currency,
        description: `Deposit to ${user?.username || 'account'}`
      });
    },
    onSuccess: (response: any) => {
      if (response.success) {
        setTransactionId(response.data.CheckoutRequestID);
        // Invalidate queries to refresh balance after successful payment
        queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        setPaymentStatus('pending');
        // Start polling for payment status
        pollPaymentStatus(response.data.CheckoutRequestID);
        toast({
          title: "Payment Initiated",
          description: "Please check your phone and enter your M-PESA PIN"
        });
      } else {
        setPaymentStatus('failed');
        toast({
          title: "Payment Failed",
          description: response.message || "Unable to initiate payment",
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
    const maxAttempts = 30; // Poll for 3 minutes max
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response: any = await apiRequest('GET', `/api/mpesa/payment-status/${checkoutRequestID}`);
        
        if (response.success) {
          if (response.data.status === 'completed') {
            setPaymentStatus('success');
            toast({
              title: "Payment Successful",
              description: `Successfully deposited ${currency} ${amount}`
            });
            // Redirect to deposit page after 3 seconds
            setTimeout(() => {
              setLocation('/deposit');
            }, 3000);
            return;
          } else if (response.data.status === 'failed') {
            setPaymentStatus('failed');
            toast({
              title: "Payment Failed",
              description: response.data.message || "Payment was not completed",
              variant: "destructive"
            });
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 6000); // Check every 6 seconds
        } else {
          setPaymentStatus('failed');
          toast({
            title: "Payment Timeout",
            description: "Payment verification timed out. Please check your M-PESA messages.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Status check error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 6000);
        }
      }
    };

    checkStatus();
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

    setPaymentStatus('initiating');
    mpesaPaymentMutation.mutate();
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'initiating':
      case 'pending':
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-8 w-8 text-red-500" />;
      default:
        return <Smartphone className="h-8 w-8 text-green-600" />;
    }
  };

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case 'initiating':
        return "Initiating payment...";
      case 'pending':
        return "Check your phone for M-PESA prompt";
      case 'success':
        return "Payment completed successfully!";
      case 'failed':
        return "Payment failed. Please try again.";
      default:
        return "Enter your M-PESA number to continue";
    }
  };

  useEffect(() => {
    // Clear localStorage on component mount
    localStorage.removeItem('mpesa_amount');
    localStorage.removeItem('mpesa_currency');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
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
            <h1 className="text-3xl font-bold">M-PESA Deposit</h1>
            <p className="text-muted-foreground">Secure mobile money transfer</p>
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-md mx-auto"
        >
          <Card className="overflow-hidden">
            <CardHeader className="text-center bg-gradient-to-r from-green-600 to-green-700 text-white">
              <CardTitle className="flex items-center justify-center gap-2">
                <Smartphone className="h-6 w-6" />
                M-PESA Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Amount Display */}
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Amount to deposit</p>
                <p className="text-3xl font-bold text-green-600">
                  {currency} {parseInt(amount).toLocaleString()}
                </p>
              </div>

              {/* Status Indicator */}
              <motion.div
                key={paymentStatus}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center space-y-3"
              >
                <div className="flex justify-center">
                  {getStatusIcon()}
                </div>
                <p className="text-sm font-medium">{getStatusMessage()}</p>
              </motion.div>

              {/* Mobile Number Input */}
              <AnimatePresence>
                {paymentStatus === 'idle' && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="mobile">Mobile Number</Label>
                      <Input
                        id="mobile"
                        type="tel"
                        placeholder="254712345678"
                        value={mobileNumber}
                        onChange={handleMobileNumberChange}
                        className="text-lg h-12"
                        maxLength={12}
                        data-testid="input-mobile-number"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter your Safaricom number (254XXXXXXXXX)
                      </p>
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={!mobileNumber || !validateMobileNumber(mobileNumber)}
                      className="w-full h-12 text-lg"
                      data-testid="button-pay-now"
                    >
                      <Smartphone className="h-4 w-4 mr-2" />
                      Pay Now
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Transaction Details */}
              {transactionId && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center text-xs text-muted-foreground border-t pt-4"
                >
                  <p>Transaction ID: {transactionId}</p>
                </motion.div>
              )}

              {/* Payment Success Actions */}
              <AnimatePresence>
                {paymentStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
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
              </AnimatePresence>

              {/* Retry Button */}
              <AnimatePresence>
                {paymentStatus === 'failed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
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
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="max-w-md mx-auto"
        >
          <div className="text-center text-xs text-muted-foreground space-y-2">
            <p>🔒 Your payment is secured by Safaricom M-PESA</p>
            <p>You will receive an SMS confirmation upon completion</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default MpesaDeposit;