import { redisCache } from './redis-cache';
import { logger } from './logger';

// Monthly quota limit
const MONTHLY_QUOTA = 2_500_000;
const DAILY_QUOTA = Math.floor(MONTHLY_QUOTA / 30);

export class ApiQuotaTracker {
  // Increment request counter with specific credit cost
  async incrementRequest(creditCost: number = 1): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const month = today.substring(0, 7); // YYYY-MM
    
    try {
      // Increment daily counter
      const dailyKey = `quota:daily:${today}`;
      const dailyCount = await redisCache.get<number>(dailyKey) || 0;
      await redisCache.set(dailyKey, dailyCount + creditCost, 86400 * 7);
      
      // Increment monthly counter
      const monthlyKey = `quota:monthly:${month}`;
      const monthlyCount = await redisCache.get<number>(monthlyKey) || 0;
      await redisCache.set(monthlyKey, monthlyCount + creditCost, 86400 * 60);
    } catch (error) {
      logger.error('Failed to increment quota:', error);
    }
  }

  // Get current usage stats
  async getUsageStats(): Promise<{
    today: {
      count: number;
      limit: number;
      percentage: number;
    };
    thisMonth: {
      count: number;
      limit: number;
      percentage: number;
    };
    alert: {
      level: 'none' | 'warning' | 'critical';
      message: string;
    };
  }> {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    
    const dailyKey = `quota:daily:${today}`;
    const monthlyKey = `quota:monthly:${month}`;
    
    const dailyCount = await redisCache.get<number>(dailyKey) || 0;
    const monthlyCount = await redisCache.get<number>(monthlyKey) || 0;
    
    const dailyPercentage = (dailyCount / DAILY_QUOTA) * 100;
    const monthlyPercentage = (monthlyCount / MONTHLY_QUOTA) * 100;
    
    // Determine alert level
    let alertLevel: 'none' | 'warning' | 'critical' = 'none';
    let alertMessage = 'API usage is within normal limits';
    
    if (monthlyPercentage >= 90) {
      alertLevel = 'critical';
      alertMessage = `CRITICAL: ${monthlyPercentage.toFixed(1)}% of monthly quota used!`;
    } else if (monthlyPercentage >= 80) {
      alertLevel = 'warning';
      alertMessage = `WARNING: ${monthlyPercentage.toFixed(1)}% of monthly quota used`;
    } else if (dailyPercentage >= 120) {
      alertLevel = 'warning';
      alertMessage = `WARNING: Daily usage ${dailyPercentage.toFixed(1)}% above expected daily rate`;
    }
    
    return {
      today: {
        count: dailyCount,
        limit: DAILY_QUOTA,
        percentage: dailyPercentage,
      },
      thisMonth: {
        count: monthlyCount,
        limit: MONTHLY_QUOTA,
        percentage: monthlyPercentage,
      },
      alert: {
        level: alertLevel,
        message: alertMessage,
      },
    };
  }

  // Get historical data for the last 30 days
  async getHistoricalData(): Promise<Array<{ date: string; count: number }>> {
    const history: Array<{ date: string; count: number }> = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dailyKey = `quota:daily:${dateStr}`;
      const count = await redisCache.get<number>(dailyKey) || 0;
      
      history.push({
        date: dateStr,
        count,
      });
    }
    
    return history;
  }

  // Check if quota is exceeded
  async isQuotaExceeded(): Promise<boolean> {
    const stats = await this.getUsageStats();
    return stats.thisMonth.percentage >= 100;
  }

  // Get projected end-of-month usage
  async getProjectedUsage(): Promise<{
    current: number;
    projected: number;
    daysRemaining: number;
    averageDailyRate: number;
  }> {
    const today = new Date();
    const month = today.toISOString().substring(0, 7);
    const monthlyKey = `quota:monthly:${month}`;
    
    const currentUsage = await redisCache.get<number>(monthlyKey) || 0;
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    
    const averageDailyRate = currentUsage / dayOfMonth;
    const projected = Math.round(currentUsage + (averageDailyRate * daysRemaining));
    
    return {
      current: currentUsage,
      projected,
      daysRemaining,
      averageDailyRate: Math.round(averageDailyRate),
    };
  }
}

export const apiQuotaTracker = new ApiQuotaTracker();
