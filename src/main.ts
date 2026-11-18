/**
 * Minecraft MCP Mineflayer - Modular Entry Point
 *
 * This is the new modular architecture entry point.
 * It sets up the configuration, bot manager, tool registry, and MCP server.
 */

import { ConfigLoader } from './config/index.js';
import { createBotManager } from './bot/index.js';
import { createToolRegistry, registerBuiltInTools } from './tools/index.js';
import type { ToolContext } from './tools/base-tool.js';
import { createMCPServer } from './server/index.js';
import { logger, configureLogger } from './utils/logger.js';

const log = logger.child('main');

// Prevent process crashes on unexpected async errors
process.on('unhandledRejection', (reason: unknown) => {
  log.error('Unhandled rejection', { error: reason });
});

process.on('uncaughtException', (error: Error) => {
  log.error('Uncaught exception', { error });
});

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  log.info('Starting Minecraft MCP Mineflayer (Modular Architecture)');

  // Load configuration
  const config = ConfigLoader.load();
  log.info('Configuration loaded', {
    server: config.server,
    logging: config.logging,
  });

  // Configure logger based on config
  configureLogger({
    level: config.logging.level,
    format: config.logging.format,
  });

  // Create bot manager
  const botManager = createBotManager(config);
  log.debug('Bot manager created');

  // Create tool registry
  const toolRegistry = createToolRegistry();
  log.debug('Tool registry created');

  // Create tool context
  const toolContext: ToolContext & { botManager: typeof botManager } = {
    getBotOrThrow: (username?: string) => botManager.getOrThrow(username),
    getAllBots: () => botManager.getAll(),
    config,
    botManager, // Include bot manager for connection tools
  };

  // Register built-in tools
  await registerBuiltInTools(toolRegistry, toolContext);
  log.info('Tools registered', { count: toolRegistry.size });

  // Create and start MCP server
  const server = createMCPServer({
    config,
    toolRegistry,
    botManager,
  });

  await server.start();
  log.info('MCP server started and ready');

  // Handle graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run main
main().catch((error) => {
  log.error('Fatal error', { error });
  process.exit(1);
});
