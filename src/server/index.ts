/**
 * MCP Server wrapper for Minecraft bot control
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AppConfig } from '../config/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { BotManager } from '../bot/bot-manager.js';
import { logger } from '../utils/logger.js';

/** Fallback request structure */
interface FallbackRequest {
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

/** Server with optional tool list changed method */
type ServerWithToolListChanged = Server & {
  sendToolListChanged?(): void;
};

const log = logger.child('server');

/** MCP Server options */
export interface MCPServerOptions {
  config: AppConfig;
  toolRegistry: ToolRegistry;
  botManager: BotManager;
}

/**
 * MCP Server class
 */
export class MCPServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private botManager: BotManager;
  private config: AppConfig;
  private keepaliveInterval: NodeJS.Timeout | null = null;

  constructor(options: MCPServerOptions) {
    this.config = options.config;
    this.toolRegistry = options.toolRegistry;
    this.botManager = options.botManager;

    // Create MCP server
    this.server = new Server(
      {
        name: this.config.server.name,
        version: this.config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // Handle tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.toolRegistry.listTools();
      log.debug('tools/list called', { count: tools.length });
      return { tools };
    });

    // Handle tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      log.debug('tools/call', { name, args });

      try {
        const result = await this.toolRegistry.execute(name, args || {});

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        log.error('Tool execution failed', { name, error });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // Fallback handler for backward compatibility
    this.server.fallbackRequestHandler = async (request: unknown) => {
      const { method, params } = request as FallbackRequest;

      // Handle legacy method names
      if (method === 'list_tools') {
        const tools = this.toolRegistry.listTools();
        return { tools };
      }

      if (method === 'call_tool' && params) {
        const { name, arguments: args } = params;
        const result = await this.toolRegistry.execute(name ?? '', args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      log.warn('Unknown method', { method });
      throw new Error(`Unknown method: ${method}`);
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    log.info('Starting MCP server', {
      name: this.config.server.name,
      version: this.config.server.version,
      tools: this.toolRegistry.size,
    });

    // Connect via stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Set up keepalive to re-announce tools
    this.keepaliveInterval = setInterval(() => {
      try {
        (this.server as ServerWithToolListChanged).sendToolListChanged?.();
      } catch {}
    }, 120000);

    // Handle initialization
    this.server.oninitialized = () => {
      log.info('MCP server initialized');
      try {
        (this.server as ServerWithToolListChanged).sendToolListChanged?.();
      } catch {}
    };

    // Handle close
    this.server.onclose = () => {
      log.info('MCP server closed');
      this.cleanup();
    };

    // Handle errors
    this.server.onerror = (error: Error) => {
      log.error('MCP server error', { error });
    };

    log.info('MCP server started');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    log.info('Stopping MCP server');
    this.cleanup();
    await this.server.close();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    // Destroy all bots
    this.botManager.destroyAll().catch((e) => {
      log.error('Failed to destroy bots on cleanup', { error: e });
    });
  }

  /**
   * Get the underlying MCP server
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the bot manager
   */
  getBotManager(): BotManager {
    return this.botManager;
  }
}

/**
 * Create an MCP server
 */
export function createMCPServer(options: MCPServerOptions): MCPServer {
  return new MCPServer(options);
}
