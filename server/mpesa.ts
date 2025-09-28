import axios from 'axios';
import crypto from 'crypto';

interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  environment: 'sandbox' | 'live';
}

interface STKPushRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export class MpesaService {
  private config: MpesaConfig;
  private baseUrl: string;

  constructor() {
    this.config = {
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      passkey: process.env.MPESA_PASSKEY!,
      shortcode: process.env.MPESA_SHORTCODE!,
      environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'live') || 'sandbox'
    };

    this.baseUrl = this.config.environment === 'live' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';

    // Validate required environment variables
    if (!this.config.consumerKey || !this.config.consumerSecret || 
        !this.config.passkey || !this.config.shortcode) {
      console.error('Missing required M-PESA environment variables');
      // Don't throw here to prevent server startup failure
    }
  }

  /**
   * Generate OAuth access token
   */
  async getAccessToken(): Promise<string> {
    try {
      const auth = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
      
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.access_token;
    } catch (error: any) {
      console.error('M-PESA OAuth error:', error.response?.data || error.message);
      throw new Error('Failed to get M-PESA access token');
    }
  }

  /**
   * Generate password for STK Push
   */
  private generatePassword(timestamp: string): string {
    const data = this.config.shortcode + this.config.passkey + timestamp;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Generate timestamp in the required format
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Format phone number to M-PESA format
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      cleaned = '254' + cleaned;
    } else if (!cleaned.startsWith('254')) {
      throw new Error('Invalid phone number format');
    }
    
    // Validate Kenyan mobile number
    if (!/^254[17]\d{8}$/.test(cleaned)) {
      throw new Error('Invalid Kenyan mobile number');
    }
    
    return cleaned;
  }

  /**
   * Initiate STK Push payment
   */
  async stkPush(request: STKPushRequest): Promise<STKPushResponse> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);
      const formattedPhone = this.formatPhoneNumber(request.phoneNumber);

      const payload = {
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(request.amount), // Ensure amount is integer
        PartyA: formattedPhone,
        PartyB: this.config.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: request.callbackUrl,
        AccountReference: request.accountReference,
        TransactionDesc: request.transactionDesc
      };

      console.log('STK Push payload:', { 
        BusinessShortCode: payload.BusinessShortCode, 
        TransactionType: payload.TransactionType,
        Amount: payload.Amount,
        PhoneNumber: payload.PhoneNumber.substring(0, 6) + 'XXXX',
        AccountReference: payload.AccountReference,
        CallBackURL: payload.CallBackURL
      });

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('STK Push response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('STK Push error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.errorMessage || 'STK Push failed');
    }
  }

  /**
   * Query STK Push transaction status
   */
  async querySTKPushStatus(checkoutRequestID: string): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);

      const payload = {
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('STK Push query error:', error.response?.data || error.message);
      throw new Error('Failed to query transaction status');
    }
  }

  /**
   * Process M-PESA callback data
   */
  processCallback(callbackData: any): {
    resultCode: number;
    resultDesc: string;
    checkoutRequestID?: string;
    merchantRequestID?: string;
    amount?: number;
    mpesaReceiptNumber?: string;
    transactionDate?: string;
    phoneNumber?: string;
  } {
    try {
      const { Body } = callbackData;
      const { stkCallback } = Body;

      const result = {
        resultCode: stkCallback.ResultCode,
        resultDesc: stkCallback.ResultDesc,
        checkoutRequestID: stkCallback.CheckoutRequestID,
        merchantRequestID: stkCallback.MerchantRequestID
      };

      // If payment was successful, extract additional details
      if (stkCallback.ResultCode === 0 && stkCallback.CallbackMetadata) {
        const items = stkCallback.CallbackMetadata.Item;
        const getValue = (name: string) => {
          const item = items.find((i: any) => i.Name === name);
          return item ? item.Value : null;
        };

        return {
          ...result,
          amount: getValue('Amount'),
          mpesaReceiptNumber: getValue('MpesaReceiptNumber'),
          transactionDate: getValue('TransactionDate'),
          phoneNumber: getValue('PhoneNumber')
        };
      }

      return result;
    } catch (error) {
      console.error('Callback processing error:', error);
      throw new Error('Failed to process M-PESA callback');
    }
  }
}

export const mpesaService = new MpesaService();