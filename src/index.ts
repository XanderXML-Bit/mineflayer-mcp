/**
 * Minecraft MCP Mineflayer - Entry Point (Compatibility Shim)
 *
 * This file redirects to the modular architecture in main.ts.
 * Kept for backward compatibility with existing MCP client configurations.
 */

// Re-export everything from main
export * from './main.js';

// Import and run main
import('./main.js').catch((error) => {
  console.error('[minecraft-mcp] Failed to start modular architecture:', error);
  process.exit(1);
});
