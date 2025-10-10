type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  private level: LogLevel;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || 'error').toLowerCase() as LogLevel;
    this.level = LOG_LEVELS[envLevel] !== undefined ? envLevel : 'error';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error('❌ ERROR:', ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn('⚠️  WARN:', ...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log('ℹ️  INFO:', ...args);
    }
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log('🔍 DEBUG:', ...args);
    }
  }

  success(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log('✅', ...args);
    }
  }
}

export const logger = new Logger();
