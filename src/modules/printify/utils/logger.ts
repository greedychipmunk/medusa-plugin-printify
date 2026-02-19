/**
 * Logging Utilities
 * 
 * Provides structured logging for the Printify plugin with different
 * log levels, formatting, and output targets.
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
}

export interface MedusaLoggerLike {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableColors?: boolean;
  enableTimestamp?: boolean;
  medusaLogger?: MedusaLoggerLike;
}

/**
 * Structured logger for Printify plugin
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      prefix: 'Printify',
      enableColors: true,
      enableTimestamp: true,
      ...config,
    };
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    // Skip if log level is below configured threshold
    if (level > this.config.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error,
    };

    const formattedMessage = this.formatMessage(entry);
    this.output(level, formattedMessage);

    // Log error stack trace separately for errors
    if (error && level === LogLevel.ERROR) {
      this.output(level, error.stack || 'No stack trace available');
    }
  }

  /**
   * Format log message for output
   */
  private formatMessage(entry: LogEntry): string {
    const parts: string[] = [];

    // Add timestamp
    if (this.config.enableTimestamp) {
      const timestamp = entry.timestamp.toISOString();
      parts.push(`[${timestamp}]`);
    }

    // Add level
    const levelName = this.getLevelName(entry.level);
    const coloredLevel = this.config.enableColors 
      ? this.colorizeLevel(levelName, entry.level)
      : levelName;
    parts.push(`[${coloredLevel}]`);

    // Add prefix
    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }

    // Add message
    parts.push(entry.message);

    // Add context
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(`- Context: ${JSON.stringify(entry.context)}`);
    }

    return parts.join(' ');
  }

  /**
   * Get level name string
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.DEBUG:
        return 'DEBUG';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Colorize level name for console output
   */
  private colorizeLevel(levelName: string, level: LogLevel): string {
    if (!this.config.enableColors) {
      return levelName;
    }

    switch (level) {
      case LogLevel.ERROR:
        return `\x1b[31m${levelName}\x1b[0m`; // Red
      case LogLevel.WARN:
        return `\x1b[33m${levelName}\x1b[0m`; // Yellow
      case LogLevel.INFO:
        return `\x1b[36m${levelName}\x1b[0m`; // Cyan
      case LogLevel.DEBUG:
        return `\x1b[37m${levelName}\x1b[0m`; // White
      default:
        return levelName;
    }
  }

  /**
   * Output formatted message to appropriate target
   */
  private output(level: LogLevel, message: string): void {
    const ml = this.config.medusaLogger;
    if (ml) {
      switch (level) {
        case LogLevel.ERROR:
          ml.error(message);
          break;
        case LogLevel.WARN:
          ml.warn(message);
          break;
        case LogLevel.INFO:
          ml.info(message);
          break;
        case LogLevel.DEBUG:
          ml.debug(message);
          break;
        default:
          ml.info(message);
      }
      return;
    }

    switch (level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.log(message);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * Create child logger with additional context
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }

  /**
   * Set the MedusaJS logger backend, routing all output through it
   */
  setMedusaLogger(medusaLogger: MedusaLoggerLike): void {
    this.config.medusaLogger = medusaLogger;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({
  level: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  prefix: 'Printify',
  enableColors: process.env.NODE_ENV !== 'production',
  enableTimestamp: true,
});

/**
 * Create logger from environment configuration
 */
export function createLogger(prefix?: string): Logger {
  const level = getLogLevelFromEnv();
  
  return new Logger({
    level,
    prefix: prefix || 'Printify',
    enableColors: process.env.NODE_ENV !== 'production',
    enableTimestamp: true,
  });
}

/**
 * Parse log level from environment variable
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  
  switch (envLevel) {
    case 'error':
      return LogLevel.ERROR;
    case 'warn':
      return LogLevel.WARN;
    case 'info':
      return LogLevel.INFO;
    case 'debug':
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
}