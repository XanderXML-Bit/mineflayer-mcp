/**
 * Chat Sanitizer Utility
 * Prevents command injection and validates chat/command inputs
 */

/** Commands that are blocked for security reasons */
export const BLOCKED_COMMANDS = [
  // Admin/operator commands
  '/ban',
  '/ban-ip',
  '/banlist',
  '/deop',
  '/kick',
  '/op',
  '/pardon',
  '/pardon-ip',
  '/whitelist',
  // Server management
  '/save-all',
  '/save-off',
  '/save-on',
  '/stop',
  '/reload',
  // Command execution (can run arbitrary commands)
  '/execute',
  '/function',
  '/schedule',
  // Data manipulation
  '/data',
  '/datapack',
  '/bossbar',
  '/forceload',
  // Player manipulation (can affect other players)
  '/gamemode',
  '/give',
  '/tp',
  '/teleport',
  '/kill',
  '/effect',
  '/clear',
  '/enchant',
  '/attribute',
  '/experience',
  '/xp',
  // World manipulation
  '/weather',
  '/time',
  '/difficulty',
  '/gamerule',
  '/worldborder',
  '/seed',
  '/setworldspawn',
  '/spawnpoint',
  '/spreadplayers',
  // Scoreboard/team (can be abused)
  '/scoreboard',
  '/team',
  '/trigger',
  // Debug/info commands
  '/debug',
  '/perf',
  '/jfr',
] as const;

/** Commands allowed for building operations */
export const ALLOWED_BUILD_COMMANDS = [
  '/fill',
  '/setblock',
  '/clone',
  '/place',
  // Note: /summon removed - can spawn dangerous entities like primed TNT
] as const;

/** Maximum message length for regular chat */
export const MAX_CHAT_LENGTH = 256;

/** Maximum command length */
export const MAX_COMMAND_LENGTH = 32000;

export interface SanitizeOptions {
  /** Allow command prefixes (/) in the message */
  allowCommands?: boolean;
  /** Maximum length (default: MAX_CHAT_LENGTH) */
  maxLength?: number;
  /** Custom blocked patterns */
  blockedPatterns?: RegExp[];
}

export interface SanitizeResult {
  /** Whether the message is valid */
  valid: boolean;
  /** The sanitized message (if valid) */
  message?: string;
  /** Error reason (if invalid) */
  error?: string;
}

/**
 * Check if a command is blocked
 */
export function isBlockedCommand(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (!lower.startsWith('/')) return false;

  return BLOCKED_COMMANDS.some(blocked =>
    lower.startsWith(blocked + ' ') || lower === blocked
  );
}

/**
 * Validate a build command against the whitelist
 */
export function isValidBuildCommand(command: string): boolean {
  const lower = command.toLowerCase().trim();
  if (!lower.startsWith('/')) return false;

  return ALLOWED_BUILD_COMMANDS.some(allowed =>
    lower.startsWith(allowed + ' ') || lower === allowed
  );
}

/**
 * Sanitize a chat message
 * Returns a result object indicating validity and the sanitized message
 */
export function sanitizeMessage(message: string, options: SanitizeOptions = {}): SanitizeResult {
  const {
    allowCommands = true,
    maxLength = MAX_CHAT_LENGTH,
    blockedPatterns = [],
  } = options;

  // Check for empty message
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  // Check length
  if (message.length > maxLength) {
    return {
      valid: false,
      error: `Message too long (${message.length} > ${maxLength} characters)`
    };
  }

  // Check for blocked commands
  if (isBlockedCommand(message)) {
    return { valid: false, error: 'This command is blocked for security reasons' };
  }

  // Check if commands are allowed
  if (!allowCommands && message.trim().startsWith('/')) {
    return { valid: false, error: 'Commands are not allowed in this context' };
  }

  // Check custom blocked patterns
  for (const pattern of blockedPatterns) {
    if (pattern.test(message)) {
      return { valid: false, error: 'Message contains blocked content' };
    }
  }

  // Remove control characters (except newline for multi-line messages)
  // eslint-disable-next-line no-control-regex
  const sanitized = message.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');

  return { valid: true, message: sanitized };
}

/**
 * Validate a build command
 * Ensures only whitelisted building commands are executed
 */
export function validateBuildCommand(command: string): SanitizeResult {
  const trimmed = command.trim();

  // Ensure it's a command
  if (!trimmed.startsWith('/')) {
    return { valid: false, error: 'Build commands must start with /' };
  }

  // Check length
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    return {
      valid: false,
      error: `Command too long (${trimmed.length} > ${MAX_COMMAND_LENGTH} characters)`
    };
  }

  // Check if it's a valid build command
  if (!isValidBuildCommand(trimmed)) {
    const allowedList = ALLOWED_BUILD_COMMANDS.join(', ');
    return {
      valid: false,
      error: `Only these commands are allowed: ${allowedList}`
    };
  }

  // Check for blocked patterns even in allowed commands
  if (isBlockedCommand(trimmed)) {
    return { valid: false, error: 'Command contains blocked elements' };
  }

  return { valid: true, message: trimmed };
}

/**
 * Sanitize a message and throw if invalid
 * Use this for simple cases where you want to fail fast
 */
export function sanitizeOrThrow(message: string, options: SanitizeOptions = {}): string {
  const result = sanitizeMessage(message, options);
  if (!result.valid || !result.message) {
    throw new Error(result.error ?? 'Invalid message');
  }
  return result.message;
}

/**
 * Validate a build command and throw if invalid
 */
export function validateBuildCommandOrThrow(command: string): string {
  const result = validateBuildCommand(command);
  if (!result.valid || !result.message) {
    throw new Error(result.error ?? 'Invalid command');
  }
  return result.message;
}
