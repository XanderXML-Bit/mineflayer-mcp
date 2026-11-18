/**
 * Logging utility for Minecraft MCP
 *
 * Logs to stderr to avoid interfering with MCP stdio protocol on stdout.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Logger configuration */
interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  prefix?: string;
}

/** Default logger configuration */
const defaultLoggerConfig: LoggerConfig = {
  level: 'info',
  format: 'text',
  prefix: 'minecraft-mcp',
};

/** Current logger configuration */
let currentConfig: LoggerConfig = { ...defaultLoggerConfig };

/**
 * Configure the logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Get the current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Serialize an error object for logging
 * Handles Error objects, nested errors, and custom properties
 */
function serializeError(error: unknown): unknown {
  if (error === null || error === undefined) {
    return error;
  }

  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    // Include stack trace for non-production
    if (error.stack) {
      serialized.stack = error.stack;
    }

    // Include any custom properties (e.g., cause, code, etc.)
    const errorObj = error as unknown as Record<string, unknown>;
    for (const key of Object.keys(errorObj)) {
      if (!['name', 'message', 'stack'].includes(key)) {
        serialized[key] = serializeValue(errorObj[key]);
      }
    }

    // Handle error cause (ES2022)
    if ('cause' in error && error.cause) {
      serialized.cause = serializeError(error.cause);
    }

    return serialized;
  }

  // If it's not an Error but still an object, return as-is
  return error;
}

/**
 * Serialize a value for logging, handling nested errors
 */
function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value !== null && typeof value === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      serialized[key] = serializeValue(val);
    }
    return serialized;
  }

  return value;
}

/**
 * Prepare data object for logging, serializing any error properties
 */
function prepareData(data: unknown): unknown {
  if (data === undefined) {
    return undefined;
  }

  return serializeValue(data);
}

/**
 * Format a log message
 */
function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  // Prepare data with error serialization
  const preparedData = prepareData(data);

  if (currentConfig.format === 'json') {
    return JSON.stringify({
      timestamp: getTimestamp(),
      level,
      prefix: currentConfig.prefix,
      message,
      ...(preparedData !== undefined ? { data: preparedData } : {}),
    });
  }

  const prefix = currentConfig.prefix ? `[${currentConfig.prefix}]` : '';
  const timestamp = getTimestamp();
  const levelStr = `[${level.toUpperCase()}]`;

  if (preparedData !== undefined) {
    const dataStr = typeof preparedData === 'object' ? JSON.stringify(preparedData) : String(preparedData);
    return `${timestamp} ${levelStr} ${prefix} ${message} ${dataStr}`;
  }

  return `${timestamp} ${levelStr} ${prefix} ${message}`;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentConfig.level];
}

/**
 * Write a log message to stderr
 */
function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  try {
    const formatted = formatMessage(level, message, data);
     
    console.error(formatted);
  } catch {
    // Silently fail - we don't want logging to crash the app
  }
}

/**
 * Logger object with level-specific methods
 */
export const logger = {
  debug(message: string, data?: unknown): void {
    writeLog('debug', message, data);
  },

  info(message: string, data?: unknown): void {
    writeLog('info', message, data);
  },

  warn(message: string, data?: unknown): void {
    writeLog('warn', message, data);
  },

  error(message: string, data?: unknown): void {
    writeLog('error', message, data);
  },

  /**
   * Create a child logger with a specific prefix
   */
  child(prefix: string) {
    const childPrefix = currentConfig.prefix
      ? `${currentConfig.prefix}:${prefix}`
      : prefix;

    return {
      debug(message: string, data?: unknown): void {
        if (!shouldLog('debug')) return;
        try {
          const formatted = formatMessage('debug', message, data).replace(
            `[${currentConfig.prefix}]`,
            `[${childPrefix}]`
          );
          console.error(formatted);
        } catch {}
      },

      info(message: string, data?: unknown): void {
        if (!shouldLog('info')) return;
        try {
          const formatted = formatMessage('info', message, data).replace(
            `[${currentConfig.prefix}]`,
            `[${childPrefix}]`
          );
          console.error(formatted);
        } catch {}
      },

      warn(message: string, data?: unknown): void {
        if (!shouldLog('warn')) return;
        try {
          const formatted = formatMessage('warn', message, data).replace(
            `[${currentConfig.prefix}]`,
            `[${childPrefix}]`
          );
          console.error(formatted);
        } catch {}
      },

      error(message: string, data?: unknown): void {
        if (!shouldLog('error')) return;
        try {
          const formatted = formatMessage('error', message, data).replace(
            `[${currentConfig.prefix}]`,
            `[${childPrefix}]`
          );
          console.error(formatted);
        } catch {}
      },
    };
  },
};

/**
 * Simple log function for backward compatibility
 */
export function log(...args: unknown[]): void {
  try {
    console.error('[minecraft-mcp]', ...args);
  } catch {}
}
