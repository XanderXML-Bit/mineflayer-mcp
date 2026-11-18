/**
 * Startup validation utilities
 *
 * Run basic checks before connecting to ensure everything is configured correctly.
 */

import { logger } from './logger.js';

const log = logger.child('startup');

export interface StartupCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

/**
 * Run all startup validation checks
 */
export function runStartupChecks(): StartupCheckResult {
  const checks: StartupCheckResult['checks'] = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  checks.push({
    name: 'Node.js version',
    passed: majorVersion >= 18,
    message: majorVersion >= 18
      ? `Node.js ${nodeVersion} (OK)`
      : `Node.js ${nodeVersion} - requires v18+ for full compatibility`,
  });

  // Check required environment
  checks.push({
    name: 'Environment',
    passed: true,
    message: `Platform: ${process.platform}, Arch: ${process.arch}`,
  });

  // Check memory
  const totalMemMB = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
  checks.push({
    name: 'Memory',
    passed: totalMemMB < 512,
    message: `Heap: ${totalMemMB}MB`,
  });

  const allPassed = checks.every((c) => c.passed);

  if (allPassed) {
    log.info('All startup checks passed');
  } else {
    log.warn('Some startup checks failed', {
      failed: checks.filter((c) => !c.passed).map((c) => c.name),
    });
  }

  return { passed: allPassed, checks };
}

/**
 * Validate connection parameters
 */
export function validateConnectionParams(params: {
  host?: string;
  port?: number;
  username?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!params.username || params.username.length < 3) {
    errors.push('Username must be at least 3 characters');
  }

  if (params.username && params.username.length > 16) {
    errors.push('Username must be at most 16 characters');
  }

  if (params.username && !/^[a-zA-Z0-9_]+$/.test(params.username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }

  if (params.port !== undefined && (params.port < 1 || params.port > 65535)) {
    errors.push('Port must be between 1 and 65535');
  }

  if (params.host !== undefined && params.host.length === 0) {
    errors.push('Host cannot be empty');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Log system info for debugging
 */
export function logSystemInfo(): void {
  log.info('System Information', {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    cwd: process.cwd(),
  });
}

/**
 * Check if required dependencies are available
 */
export async function checkDependencies(): Promise<{
  available: string[];
  missing: string[];
}> {
  const requiredModules = [
    'mineflayer',
    'mineflayer-pathfinder',
    'mineflayer-pvp',
    'mineflayer-collectblock',
    'minecraft-data',
    'vec3',
  ];

  const available: string[] = [];
  const missing: string[] = [];

  for (const mod of requiredModules) {
    try {
      await import(mod);
      available.push(mod);
    } catch {
      missing.push(mod);
    }
  }

  if (missing.length > 0) {
    log.error('Missing required dependencies', { missing });
  } else {
    log.debug('All dependencies available', { count: available.length });
  }

  return { available, missing };
}
