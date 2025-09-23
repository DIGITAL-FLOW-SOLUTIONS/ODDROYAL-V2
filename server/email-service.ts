import nodemailer from 'nodemailer';
import { pdfReportService } from './pdf-service';
import XLSX from 'xlsx';

interface EmailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

interface ScheduledReportRequest {
  id: string;
  reportType: 'daily' | 'monthly' | 'turnover' | 'payout' | 'winners' | 'chargebacks' | 'custom';
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  format: 'pdf' | 'csv' | 'excel';
  filters?: any;
  isActive: boolean;
  createdBy: string;
  nextRun: Date;
}

interface ReportDeliveryResult {
  success: boolean;
  reportId: string;
  deliveredTo: string[];
  failedRecipients: string[];
  error?: string;
}

export class EmailReportService {
  private transporter: nodemailer.Transporter | null = null;
  
  constructor() {
    this.initializeEmailTransporter();
  }
  
  /**
   * Initialize email transporter with configuration
   */
  private initializeEmailTransporter() {
    try {
      // Get email configuration from environment variables
      const emailConfig: EmailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      };
      
      // Only create transporter if we have valid SMTP configuration
      if (emailConfig.auth?.user && emailConfig.auth?.pass) {
        this.transporter = nodemailer.createTransporter(emailConfig);
        console.log('Email service initialized successfully');
      } else {
        console.warn('Email service not configured - SMTP credentials missing');
        console.log('To enable email reports, set SMTP_USER and SMTP_PASS environment variables');
      }
    } catch (error) {
      console.error('Failed to initialize email service:', error);
    }
  }
  
  /**
   * Send a scheduled report via email
   */
  async sendScheduledReport(
    reportData: any,
    scheduledReport: ScheduledReportRequest
  ): Promise<ReportDeliveryResult> {
    if (!this.transporter) {
      return {
        success: false,
        reportId: scheduledReport.id,
        deliveredTo: [],
        failedRecipients: scheduledReport.recipients,
        error: 'Email service not configured'
      };
    }
    
    try {
      // Generate report attachment based on format
      const attachment = await this.generateReportAttachment(reportData, scheduledReport);
      
      // Create email content
      const emailSubject = this.generateEmailSubject(scheduledReport);
      const emailBody = await this.generateEmailBody(reportData, scheduledReport);
      
      const deliveredTo: string[] = [];
      const failedRecipients: string[] = [];
      
      // Send email to each recipient
      for (const recipient of scheduledReport.recipients) {
        try {
          await this.transporter.sendMail({
            from: {
              name: 'OddRoyal Reports',
              address: process.env.SMTP_FROM || process.env.SMTP_USER || 'reports@oddroyal.com'
            },
            to: recipient,
            subject: emailSubject,
            html: emailBody,
            attachments: attachment ? [attachment] : undefined
          });
          
          deliveredTo.push(recipient);
          console.log(`Report ${scheduledReport.id} delivered to ${recipient}`);
        } catch (emailError) {
          console.error(`Failed to send report to ${recipient}:`, emailError);
          failedRecipients.push(recipient);
        }
      }
      
      return {
        success: deliveredTo.length > 0,
        reportId: scheduledReport.id,
        deliveredTo,
        failedRecipients,
        error: failedRecipients.length > 0 ? `Failed to deliver to ${failedRecipients.length} recipients` : undefined
      };
    } catch (error) {
      console.error('Failed to send scheduled report:', error);
      return {
        success: false,
        reportId: scheduledReport.id,
        deliveredTo: [],
        failedRecipients: scheduledReport.recipients,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Generate report attachment based on format
   */
  private async generateReportAttachment(
    reportData: any,
    scheduledReport: ScheduledReportRequest
  ): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const baseFilename = `${scheduledReport.reportType}_report_${dateStr}`;
      
      switch (scheduledReport.format) {
        case 'pdf':
          const pdfBuffer = await pdfReportService.generateReport({
            title: this.getReportTitle(scheduledReport.reportType),
            subtitle: `${scheduledReport.frequency} Automated Report`,
            data: reportData,
            reportType: scheduledReport.reportType,
            dateRange: {
              from: this.getDateRangeStart(scheduledReport.frequency),
              to: new Date()
            },
            includeCharts: true,
            companyInfo: {
              name: 'OddRoyal',
              address: 'Professional Sports Betting Platform'
            }
          });
          
          return {
            filename: `${baseFilename}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          };
          
        case 'excel':
          const excelBuffer = await this.generateExcelReport(reportData, scheduledReport.reportType);
          return {
            filename: `${baseFilename}.xlsx`,
            content: excelBuffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };
          
        case 'csv':
          const csvContent = this.generateCSVReport(reportData, scheduledReport.reportType);
          return {
            filename: `${baseFilename}.csv`,
            content: Buffer.from(csvContent),
            contentType: 'text/csv'
          };
          
        default:
          return null;
      }
    } catch (error) {
      console.error('Failed to generate report attachment:', error);
      return null;
    }
  }
  
  /**
   * Generate Excel report using XLSX
   */
  private async generateExcelReport(reportData: any, reportType: string): Promise<Buffer> {
    const workbook = XLSX.utils.book_new();
    
    // Create summary worksheet
    const summaryData = this.formatDataForExcel(reportData, reportType);
    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData.summary);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
    
    // Create detailed data worksheet if available
    if (summaryData.details && summaryData.details.length > 0) {
      const detailsWorksheet = XLSX.utils.aoa_to_sheet(summaryData.details);
      XLSX.utils.book_append_sheet(workbook, detailsWorksheet, 'Detailed Data');
    }
    
    // Add charts worksheet if data supports it
    if (summaryData.chartData && summaryData.chartData.length > 0) {
      const chartWorksheet = XLSX.utils.aoa_to_sheet(summaryData.chartData);
      XLSX.utils.book_append_sheet(workbook, chartWorksheet, 'Chart Data');
    }
    
    // Convert to buffer
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    });
    
    return excelBuffer;
  }
  
  /**
   * Format data for Excel export
   */
  private formatDataForExcel(reportData: any, reportType: string): {
    summary: any[][];
    details?: any[][];
    chartData?: any[][];
  } {
    const result = {
      summary: [['OddRoyal - ' + this.getReportTitle(reportType)], [''], ['Generated:', new Date().toLocaleString()], ['']],
      details: undefined as any[][] | undefined,
      chartData: undefined as any[][] | undefined
    };
    
    switch (reportType) {
      case 'daily':
      case 'monthly':
        result.summary.push(
          ['Metric', 'Value'],
          ['Total Stake', '£' + (reportData.totalStakeCents / 100).toLocaleString()],
          ['Total Payouts', '£' + (reportData.totalPayoutsCents / 100).toLocaleString()],
          ['Gross Gaming Revenue', '£' + (reportData.grossGamingRevenueCents / 100).toLocaleString()],
          ['Total Bets', reportData.totalBets],
          ['Active Players', reportData.activePlayers],
          ['Win Rate', (reportData.winRate * 100).toFixed(2) + '%']
        );
        
        if (reportData.dailyBreakdown) {
          result.details = [
            ['Day', 'Stake (£)', 'GGR (£)', 'Bets'],
            ...reportData.dailyBreakdown.map((day: any) => [
              day.day,
              (day.stakeCents / 100).toFixed(2),
              (day.ggrCents / 100).toFixed(2),
              day.bets
            ])
          ];
        }
        break;
        
      case 'turnover':
        result.summary.push(
          ['Sport', 'Turnover (£)', 'Bets', 'GGR (£)', 'Share (%)'],
          ...reportData.sports.map((sport: any) => [
            sport.sport,
            (sport.turnoverCents / 100).toLocaleString(),
            sport.betCount,
            (sport.ggrCents / 100).toLocaleString(),
            ((sport.turnoverCents / reportData.totalTurnoverCents) * 100).toFixed(1)
          ])
        );
        break;
        
      case 'winners':
        if (reportData.winners) {
          result.summary.push(
            ['Rank', 'Username', 'Net Winnings (£)', 'Bet Count'],
            ...reportData.winners.map((winner: any, index: number) => [
              index + 1,
              winner.username,
              (winner.netWinningsCents / 100).toFixed(2),
              winner.betCount
            ])
          );
        }
        break;
    }
    
    return result;
  }
  
  /**
   * Generate CSV report
   */
  private generateCSVReport(reportData: any, reportType: string): string {
    const excelData = this.formatDataForExcel(reportData, reportType);
    
    // Convert summary to CSV
    const csvRows = excelData.summary.map(row => 
      row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(',')
    );
    
    // Add details if available
    if (excelData.details) {
      csvRows.push('', 'Detailed Data', '');
      excelData.details.forEach(row => {
        csvRows.push(
          row.map(cell => 
            typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
          ).join(',')
        );
      });
    }
    
    return csvRows.join('\n');
  }
  
  /**
   * Generate email subject line
   */
  private generateEmailSubject(scheduledReport: ScheduledReportRequest): string {
    const reportTitle = this.getReportTitle(scheduledReport.reportType);
    const frequency = scheduledReport.frequency.charAt(0).toUpperCase() + scheduledReport.frequency.slice(1);
    const dateStr = new Date().toLocaleDateString('en-GB');
    
    return `OddRoyal ${frequency} ${reportTitle} - ${dateStr}`;
  }
  
  /**
   * Generate email body content
   */
  private async generateEmailBody(reportData: any, scheduledReport: ScheduledReportRequest): Promise<string> {
    const reportTitle = this.getReportTitle(scheduledReport.reportType);
    const dateStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Generate key metrics summary
    const keyMetrics = this.generateKeyMetricsSummary(reportData, scheduledReport.reportType);
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: #3B82F6;
              color: white;
              padding: 20px;
              border-radius: 8px 8px 0 0;
              text-align: center;
            }
            .content {
              background: #f9fafb;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              margin: 20px 0;
            }
            .metric-card {
              background: white;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #3B82F6;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .metric-value {
              font-size: 24px;
              font-weight: bold;
              color: #1f2937;
              margin-bottom: 4px;
            }
            .metric-label {
              font-size: 14px;
              color: #6b7280;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
            }
            .attachment-note {
              background: #fef3c7;
              padding: 15px;
              border-radius: 6px;
              margin: 20px 0;
            }
            @media (max-width: 480px) {
              .metrics-grid {
                grid-template-columns: 1fr;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>OddRoyal</h1>
            <h2>${reportTitle}</h2>
            <p>${dateStr}</p>
          </div>
          
          <div class="content">
            <h3>Executive Summary</h3>
            <p>Please find your ${scheduledReport.frequency} ${reportTitle.toLowerCase()} attached to this email. 
               The report includes comprehensive analytics and key performance metrics for the specified period.</p>
            
            ${keyMetrics}
            
            <div class="attachment-note">
              <strong>📎 Attachment:</strong> The complete report is attached as a ${scheduledReport.format.toUpperCase()} file 
              with detailed breakdowns, charts, and comprehensive data analysis.
            </div>
            
            <h4>Report Details:</h4>
            <ul>
              <li><strong>Report Type:</strong> ${reportTitle}</li>
              <li><strong>Frequency:</strong> ${scheduledReport.frequency}</li>
              <li><strong>Format:</strong> ${scheduledReport.format.toUpperCase()}</li>
              <li><strong>Generated:</strong> ${new Date().toLocaleString('en-GB')}</li>
            </ul>
            
            <p>For questions about this report or to modify your subscription preferences, 
               please contact your system administrator or the OddRoyal support team.</p>
          </div>
          
          <div class="footer">
            <p><strong>CONFIDENTIAL:</strong> This report contains confidential business information. 
               Please handle in accordance with your organization's data protection policies.</p>
            <p>© ${new Date().getFullYear()} OddRoyal. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;
  }
  
  /**
   * Generate key metrics summary for email
   */
  private generateKeyMetricsSummary(reportData: any, reportType: string): string {
    switch (reportType) {
      case 'daily':
      case 'monthly':
        return `
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">£${(reportData.grossGamingRevenueCents / 100).toLocaleString()}</div>
              <div class="metric-label">Gross Gaming Revenue</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${reportData.totalBets}</div>
              <div class="metric-label">Total Bets</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${reportData.activePlayers}</div>
              <div class="metric-label">Active Players</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${(reportData.winRate * 100).toFixed(1)}%</div>
              <div class="metric-label">Player Win Rate</div>
            </div>
          </div>
        `;
        
      case 'turnover':
        const topSport = reportData.sports && reportData.sports[0];
        return `
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">£${(reportData.totalTurnoverCents / 100).toLocaleString()}</div>
              <div class="metric-label">Total Turnover</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${topSport?.sport || 'N/A'}</div>
              <div class="metric-label">Top Performing Sport</div>
            </div>
          </div>
        `;
        
      case 'winners':
        const topWinner = reportData.winners && reportData.winners[0];
        return `
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">${reportData.winners?.length || 0}</div>
              <div class="metric-label">Players Analyzed</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">£${topWinner ? (topWinner.netWinningsCents / 100).toLocaleString() : '0'}</div>
              <div class="metric-label">Top Winner Net</div>
            </div>
          </div>
        `;
        
      default:
        return '<p>Key metrics summary not available for this report type.</p>';
    }
  }
  
  /**
   * Get human-readable report title
   */
  private getReportTitle(reportType: string): string {
    const titles = {
      daily: 'Daily Financial Report',
      monthly: 'Monthly Financial Report',
      turnover: 'Turnover by Sport Report',
      payout: 'Payout Ratio Analysis',
      winners: 'Top Winners Report',
      chargebacks: 'Chargeback Analysis',
      custom: 'Custom Report'
    };
    return titles[reportType as keyof typeof titles] || 'Report';
  }
  
  /**
   * Get date range start based on frequency
   */
  private getDateRangeStart(frequency: string): Date {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      case 'weekly':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'monthly':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo;
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
  
  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<{ success: boolean; message: string }> {
    if (!this.transporter) {
      return {
        success: false,
        message: 'Email service not configured - missing SMTP credentials'
      };
    }
    
    try {
      await this.transporter.verify();
      return {
        success: true,
        message: 'Email configuration is valid and ready to send reports'
      };
    } catch (error) {
      return {
        success: false,
        message: `Email configuration error: ${(error as Error).message}`
      };
    }
  }
}

// Export singleton instance
export const emailReportService = new EmailReportService();