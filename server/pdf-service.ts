import puppeteer from 'puppeteer';
import DOMPurify from 'isomorphic-dompurify';

interface PDFOptions {
  title: string;
  subtitle?: string;
  data: any;
  reportType: 'daily' | 'monthly' | 'turnover' | 'payout' | 'winners' | 'chargebacks' | 'custom';
  dateRange: {
    from: Date;
    to: Date;
  };
  includeCharts?: boolean;
  companyInfo?: {
    name: string;
    logo?: string;
    address?: string;
  };
}

export class PDFReportService {
  constructor() {
    // Chart generation disabled for system compatibility
    console.log('PDF Report Service initialized - server-side charts disabled for compatibility');
  }
  
  /**
   * Generate a PDF report based on the provided options
   */
  async generateReport(options: PDFOptions): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-web-security',
        '--disable-features=TranslateUI'
      ],
      timeout: 60000,
      protocolTimeout: 240000
    });
    
    try {
      const page = await browser.newPage();
      
      // Generate HTML content
      const htmlContent = await this.generateHTML(options);
      
      // Set content and generate PDF
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '20mm',
          right: '20mm'
        },
        headerTemplate: this.getHeaderTemplate(options),
        footerTemplate: this.getFooterTemplate(),
        displayHeaderFooter: true
      });
      
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
  
  /**
   * Generate HTML content for the PDF
   */
  private async generateHTML(options: PDFOptions): Promise<string> {
    const { reportType, data, title, subtitle, dateRange, includeCharts = true } = options;
    
    // Server-side chart generation disabled for system compatibility
    let chartImages = '';
    console.log('Chart generation skipped - charts available in admin dashboard');
    
    const tableContent = this.generateTableContent(reportType, data);
    const summaryContent = this.generateSummaryContent(reportType, data);
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            ${this.getReportStyles()}
          </style>
        </head>
        <body>
          <div class="report-container">
            <!-- Header Section -->
            <div class="report-header">
              <div class="company-info">
                <img src="data:image/svg+xml,${this.getLogoSVG()}" alt="Logo" class="company-logo" />
                <div class="company-details">
                  <h1>PRIMESTAKE</h1>
                  <p>Sports Betting Platform</p>
                </div>
              </div>
              <div class="report-meta">
                <h2>${title}</h2>
                ${subtitle ? `<h3>${subtitle}</h3>` : ''}
                <p class="date-range">
                  Period: ${this.formatDate(dateRange.from)} - ${this.formatDate(dateRange.to)}
                </p>
                <p class="generated-at">
                  Generated: ${new Date().toLocaleString('en-GB', { 
                    dateStyle: 'full', 
                    timeStyle: 'short' 
                  })}
                </p>
              </div>
            </div>
            
            <!-- Executive Summary -->
            <div class="executive-summary">
              <h3>Executive Summary</h3>
              ${summaryContent}
            </div>
            
            <!-- Charts Section -->
            <div class="charts-section">
              <h3>Analytics Overview</h3>
              <div class="chart-placeholder">
                <p style="text-align: center; color: #666; font-style: italic; padding: 2rem; background: #f8f9fa; border-radius: 8px; margin: 1rem 0; border: 1px dashed #ccc;">
                  📊 Interactive charts and visualizations are available in the PRIMESTAKE Admin Dashboard.<br>
                  This PDF report focuses on comprehensive data analysis and tabular information.
                </p>
              </div>
            </div>
            
            <!-- Data Tables Section -->
            <div class="data-section">
              <h3>Detailed Data</h3>
              ${tableContent}
            </div>
            
            <!-- Footer Section -->
            <div class="report-footer">
              <div class="footer-content">
                <div class="disclaimer">
                  <p><strong>Confidential:</strong> This report contains confidential business information. 
                     Distribution is restricted to authorized personnel only.</p>
                </div>
                <div class="report-info">
                  <p>Report Type: ${reportType.toUpperCase()}</p>
                  <p>Generated by: PRIMESTAKE Admin Panel v2.0</p>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
  
  /**
   * Generate chart images based on report type and data
   * Disabled for system compatibility - charts available in admin dashboard
   */
  private async generateChartImages(reportType: string, data: any): Promise<string> {
    let chartImages = '';
    
    try {
      switch (reportType) {
        case 'daily':
        case 'monthly':
          if (data.dailyBreakdown && data.dailyBreakdown.length > 0) {
            const chartBuffer = await this.generateGGRChart(data.dailyBreakdown);
            const base64Image = chartBuffer.toString('base64');
            chartImages = `<img src="data:image/png;base64,${base64Image}" alt="GGR Trend Chart" class="chart-image" />`;
          }
          break;
          
        case 'turnover':
          if (data.sports && data.sports.length > 0) {
            const chartBuffer = await this.generateTurnoverPieChart(data.sports);
            const base64Image = chartBuffer.toString('base64');
            chartImages = `<img src="data:image/png;base64,${base64Image}" alt="Turnover by Sport Chart" class="chart-image" />`;
          }
          break;
          
        case 'payout':
          if (data.winningBets && data.losingBets) {
            const chartBuffer = await this.generatePayoutChart(data);
            const base64Image = chartBuffer.toString('base64');
            chartImages = `<img src="data:image/png;base64,${base64Image}" alt="Payout Ratio Chart" class="chart-image" />`;
          }
          break;
          
        case 'winners':
          if (data.winners && data.winners.length > 0) {
            const chartBuffer = await this.generateTopWinnersChart(data.winners);
            const base64Image = chartBuffer.toString('base64');
            chartImages = `<img src="data:image/png;base64,${base64Image}" alt="Top Winners Chart" class="chart-image" />`;
          }
          break;
      }
    } catch (error) {
      console.warn('Failed to generate chart:', error);
      // Continue without charts if generation fails
    }
    
    return chartImages;
  }
  
  /**
   * Generate GGR trend chart
   */
  private async generateGGRChart(dailyData: Array<{ day: number; stakeCents: number; ggrCents: number; }>): Promise<Buffer> {
    // Chart generation disabled for system compatibility
    return Buffer.alloc(0);
  }
  
  /**
   * Generate turnover pie chart by sport
   */
  private async generateTurnoverPieChart(sportsData: Array<{ sport: string; turnoverCents: number; }>): Promise<Buffer> {
    // Chart generation disabled for system compatibility
    return Buffer.alloc(0);
  }
  
  /**
   * Generate payout ratio chart
   */
  private async generatePayoutChart(payoutData: { winningBets: number; losingBets: number; payoutRatio: number; }): Promise<Buffer> {
    // Chart generation disabled for system compatibility
    return Buffer.alloc(0);
  }
  
  /**
   * Generate top winners chart
   */
  private async generateTopWinnersChart(winnersData: Array<{ username: string; netWinningsCents: number; }>): Promise<Buffer> {
    // Chart generation disabled for system compatibility
    return Buffer.alloc(0);
  }

  /**
   * Sanitize and validate numeric data to prevent injection
   */
  private sanitizeNumber(value: any): number {
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
      return Math.max(0, value); // Ensure non-negative
    }
    return 0;
  }

  /**
   * Sanitize string data for HTML output
   */
  private sanitizeString(value: any): string {
    if (typeof value !== 'string') {
      value = String(value || '');
    }
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }
  
  /**
   * Generate table content based on report type
   */
  private generateTableContent(reportType: string, data: any): string {
    switch (reportType) {
      case 'daily':
      case 'monthly':
        return this.generateFinancialTable(data);
      case 'turnover':
        return this.generateTurnoverTable(data);
      case 'payout':
        return this.generatePayoutTable(data);
      case 'winners':
        return this.generateWinnersTable(data);
      case 'chargebacks':
        return this.generateChargebacksTable(data);
      default:
        return '<p>Data table not available for this report type.</p>';
    }
  }
  
  /**
   * Generate financial summary table with sanitized data
   */
  private generateFinancialTable(data: any): string {
    // Sanitize and validate all data inputs
    const sanitizedData = {
      totalStakeCents: this.sanitizeNumber(data.totalStakeCents),
      totalPayoutsCents: this.sanitizeNumber(data.totalPayoutsCents),
      grossGamingRevenueCents: this.sanitizeNumber(data.grossGamingRevenueCents),
      averageStakeCents: this.sanitizeNumber(data.averageStakeCents),
      totalBets: this.sanitizeNumber(data.totalBets),
      activePlayers: this.sanitizeNumber(data.activePlayers),
      winRate: this.sanitizeNumber(data.winRate)
    };

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total Stake</td>
            <td>£${(sanitizedData.totalStakeCents / 100).toLocaleString()}</td>
            <td>${sanitizedData.totalBets} bets placed</td>
          </tr>
          <tr>
            <td>Total Payouts</td>
            <td>£${(sanitizedData.totalPayoutsCents / 100).toLocaleString()}</td>
            <td>${(sanitizedData.winRate * 100).toFixed(1)}% win rate</td>
          </tr>
          <tr class="highlight-row">
            <td><strong>Gross Gaming Revenue (GGR)</strong></td>
            <td><strong>£${(sanitizedData.grossGamingRevenueCents / 100).toLocaleString()}</strong></td>
            <td><strong>Primary profit metric</strong></td>
          </tr>
          <tr>
            <td>Active Players</td>
            <td>${sanitizedData.activePlayers}</td>
            <td>Unique players with bets</td>
          </tr>
          <tr>
            <td>Average Stake</td>
            <td>£${(sanitizedData.averageStakeCents / 100).toFixed(2)}</td>
            <td>Per bet average</td>
          </tr>
        </tbody>
      </table>
    `;
  }
  
  /**
   * Generate turnover by sport table with sanitized data
   */
  private generateTurnoverTable(data: any): string {
    if (!data.sports || data.sports.length === 0) {
      return '<p>No turnover data available.</p>';
    }
    
    // Sanitize sports data
    const sanitizedSports = data.sports.map((sport: any) => ({
      sport: this.sanitizeString(sport.sport),
      turnoverCents: this.sanitizeNumber(sport.turnoverCents),
      betCount: this.sanitizeNumber(sport.betCount),
      ggrCents: this.sanitizeNumber(sport.ggrCents)
    }));

    const totalTurnoverCents = this.sanitizeNumber(data.totalTurnoverCents);
    const totalBets = this.sanitizeNumber(data.totalBets);
    const totalGgrCents = this.sanitizeNumber(data.totalGgrCents);
    
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Sport</th>
            <th>Turnover</th>
            <th>Bets</th>
            <th>GGR</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          ${sanitizedSports.map((sport: any) => `
            <tr>
              <td>${sport.sport}</td>
              <td>£${(sport.turnoverCents / 100).toLocaleString()}</td>
              <td>${sport.betCount}</td>
              <td>£${(sport.ggrCents / 100).toLocaleString()}</td>
              <td>${totalTurnoverCents > 0 ? ((sport.turnoverCents / totalTurnoverCents) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td><strong>Total</strong></td>
            <td><strong>£${(totalTurnoverCents / 100).toLocaleString()}</strong></td>
            <td><strong>${totalBets}</strong></td>
            <td><strong>£${(totalGgrCents / 100).toLocaleString()}</strong></td>
            <td><strong>100%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  }
  
  /**
   * Generate payout analysis table
   */
  private generatePayoutTable(data: any): string {
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total Stake</td>
            <td>£${(data.totalStakeCents / 100).toLocaleString()}</td>
            <td>100%</td>
          </tr>
          <tr>
            <td>Total Payouts</td>
            <td>£${(data.totalPayoutsCents / 100).toLocaleString()}</td>
            <td>${(data.payoutRatio * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Winning Bets</td>
            <td>${data.winningBets}</td>
            <td>${((data.winningBets / data.betCount) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Losing Bets</td>
            <td>${data.losingBets}</td>
            <td>${((data.losingBets / data.betCount) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Total Bets</td>
            <td>${data.betCount}</td>
            <td>100%</td>
          </tr>
        </tbody>
      </table>
    `;
  }
  
  /**
   * Generate top winners table with sanitized data
   */
  private generateWinnersTable(data: any): string {
    if (!data.winners || data.winners.length === 0) {
      return '<p>No winner data available.</p>';
    }
    
    // Sanitize winners data
    const sanitizedWinners = data.winners.map((winner: any) => ({
      username: this.sanitizeString(winner.username),
      netWinningsCents: this.sanitizeNumber(winner.netWinningsCents),
      betCount: Math.max(1, this.sanitizeNumber(winner.betCount)) // Ensure at least 1 to avoid division by zero
    }));
    
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Username</th>
            <th>Net Winnings</th>
            <th>Bet Count</th>
            <th>Avg per Bet</th>
          </tr>
        </thead>
        <tbody>
          ${sanitizedWinners.map((winner: any, index: number) => `
            <tr>
              <td>${index + 1}</td>
              <td>${winner.username}</td>
              <td class="${winner.netWinningsCents >= 0 ? 'positive' : 'negative'}">
                £${(winner.netWinningsCents / 100).toLocaleString()}
              </td>
              <td>${winner.betCount}</td>
              <td>£${(winner.netWinningsCents / winner.betCount / 100).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  /**
   * Generate chargebacks table
   */
  private generateChargebacksTable(data: any): string {
    if (!data.chargebacks || data.chargebacks.length === 0) {
      return '<p>No chargeback data available for this period.</p>';
    }
    
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>User</th>
            <th>Amount</th>
            <th>Reason</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.chargebacks.map((chargeback: any) => `
            <tr>
              <td>${this.formatDate(new Date(chargeback.createdAt))}</td>
              <td>${chargeback.username}</td>
              <td>£${(chargeback.amountCents / 100).toLocaleString()}</td>
              <td>${chargeback.reason}</td>
              <td><span class="status-badge ${chargeback.status}">${chargeback.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  /**
   * Generate summary content based on report type
   */
  private generateSummaryContent(reportType: string, data: any): string {
    switch (reportType) {
      case 'daily':
        return `
          <div class="summary-grid">
            <div class="summary-card">
              <h4>Revenue</h4>
              <p class="summary-value">£${(data.grossGamingRevenueCents / 100).toLocaleString()}</p>
              <p class="summary-label">Gross Gaming Revenue</p>
            </div>
            <div class="summary-card">
              <h4>Activity</h4>
              <p class="summary-value">${data.totalBets}</p>
              <p class="summary-label">Total Bets Placed</p>
            </div>
            <div class="summary-card">
              <h4>Players</h4>
              <p class="summary-value">${data.activePlayers}</p>
              <p class="summary-label">Active Players</p>
            </div>
            <div class="summary-card">
              <h4>Performance</h4>
              <p class="summary-value">${(data.winRate * 100).toFixed(1)}%</p>
              <p class="summary-label">Player Win Rate</p>
            </div>
          </div>
        `;
      case 'monthly':
        return `
          <div class="summary-grid">
            <div class="summary-card">
              <h4>Monthly Revenue</h4>
              <p class="summary-value">£${(data.grossGamingRevenueCents / 100).toLocaleString()}</p>
              <p class="summary-label">Total GGR for ${this.getMonthName(data.month)} ${data.year}</p>
            </div>
            <div class="summary-card">
              <h4>Best Day</h4>
              <p class="summary-value">£${(data.highestDayCents / 100).toLocaleString()}</p>
              <p class="summary-label">Highest Single Day Revenue</p>
            </div>
            <div class="summary-card">
              <h4>Worst Day</h4>
              <p class="summary-value">£${(data.lowestDayCents / 100).toLocaleString()}</p>
              <p class="summary-label">Lowest Single Day Revenue</p>
            </div>
            <div class="summary-card">
              <h4>Monthly Activity</h4>
              <p class="summary-value">${data.totalBets}</p>
              <p class="summary-label">Total Bets This Month</p>
            </div>
          </div>
        `;
      default:
        return '<p>Executive summary not available for this report type.</p>';
    }
  }
  
  /**
   * Get CSS styles for the report
   */
  private getReportStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        background: white;
      }
      
      .report-container {
        max-width: 100%;
        margin: 0 auto;
        padding: 20px;
      }
      
      .report-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #e5e7eb;
      }
      
      .company-info {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      
      .company-logo {
        width: 60px;
        height: 60px;
      }
      
      .company-details h1 {
        font-size: 24px;
        font-weight: bold;
        color: #1f2937;
        margin-bottom: 4px;
      }
      
      .company-details p {
        color: #6b7280;
        font-size: 14px;
      }
      
      .report-meta {
        text-align: right;
      }
      
      .report-meta h2 {
        font-size: 28px;
        color: #1f2937;
        margin-bottom: 8px;
      }
      
      .report-meta h3 {
        font-size: 18px;
        color: #6b7280;
        font-weight: normal;
        margin-bottom: 10px;
      }
      
      .date-range, .generated-at {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 4px;
      }
      
      .executive-summary {
        margin-bottom: 30px;
      }
      
      .executive-summary h3 {
        font-size: 20px;
        margin-bottom: 15px;
        color: #1f2937;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 8px;
      }
      
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        margin-bottom: 20px;
      }
      
      .summary-card {
        background: #f9fafb;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
      }
      
      .summary-card h4 {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .summary-value {
        font-size: 24px;
        font-weight: bold;
        color: #1f2937;
        margin-bottom: 4px;
      }
      
      .summary-label {
        font-size: 12px;
        color: #6b7280;
      }
      
      .charts-section {
        margin-bottom: 30px;
      }
      
      .charts-section h3 {
        font-size: 20px;
        margin-bottom: 15px;
        color: #1f2937;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 8px;
      }
      
      .chart-image {
        max-width: 100%;
        height: auto;
        margin: 20px 0;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
      }
      
      .data-section {
        margin-bottom: 30px;
      }
      
      .data-section h3 {
        font-size: 20px;
        margin-bottom: 15px;
        color: #1f2937;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 8px;
      }
      
      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 14px;
      }
      
      .data-table th,
      .data-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .data-table th {
        background: #f9fafb;
        font-weight: 600;
        color: #374151;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.5px;
      }
      
      .data-table tbody tr:hover {
        background: #f9fafb;
      }
      
      .data-table .highlight-row {
        background: #fef3c7 !important;
      }
      
      .data-table .total-row {
        background: #f3f4f6 !important;
        font-weight: bold;
      }
      
      .positive {
        color: #059669;
      }
      
      .negative {
        color: #dc2626;
      }
      
      .status-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        text-transform: uppercase;
      }
      
      .status-badge.pending {
        background: #fef3c7;
        color: #92400e;
      }
      
      .status-badge.resolved {
        background: #d1fae5;
        color: #065f46;
      }
      
      .status-badge.disputed {
        background: #fee2e2;
        color: #991b1b;
      }
      
      .report-footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid #e5e7eb;
      }
      
      .footer-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      
      .disclaimer {
        flex: 1;
      }
      
      .disclaimer p {
        font-size: 12px;
        color: #6b7280;
        line-height: 1.5;
      }
      
      .report-info {
        text-align: right;
      }
      
      .report-info p {
        font-size: 12px;
        color: #9ca3af;
        margin-bottom: 2px;
      }
      
      @media print {
        .report-container {
          padding: 10px;
        }
        
        .summary-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
  }
  
  /**
   * Get header template for PDF
   */
  private getHeaderTemplate(options: PDFOptions): string {
    return `
      <div style="font-size: 10px; padding: 5px 20mm 0; width: 100%; text-align: center; color: #6b7280;">
        <span>${options.title} | ${options.companyInfo?.name || 'PRIMESTAKE'}</span>
      </div>
    `;
  }
  
  /**
   * Get footer template for PDF
   */
  private getFooterTemplate(): string {
    return `
      <div style="font-size: 10px; padding: 5px 20mm 0; width: 100%; text-align: center; color: #6b7280;">
        <span class="date"></span> | Page <span class="pageNumber"></span> of <span class="totalPages"></span> | Confidential & Proprietary
      </div>
    `;
  }
  
  /**
   * Get company logo as SVG
   */
  private getLogoSVG(): string {
    // Simple geometric logo SVG (encoded for data URL)
    const svg = `
      <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="60" rx="12" fill="%233B82F6"/>
        <path d="M20 20 L40 20 L40 25 L25 25 L25 30 L40 30 L40 35 L25 35 L25 40 L20 40 Z" fill="white"/>
        <circle cx="35" cy="45" r="3" fill="white"/>
      </svg>
    `;
    return encodeURIComponent(svg);
  }
  
  /**
   * Utility functions
   */
  private shouldIncludeChart(reportType: string): boolean {
    // Chart generation disabled for system compatibility
    return false;
    /*
    return ['daily', 'monthly', 'turnover', 'payout', 'winners'].includes(reportType);
    */
  }
  
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }
  
  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || 'Unknown';
  }
}

// Export singleton instance
export const pdfReportService = new PDFReportService();