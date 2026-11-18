/**
 * Type declarations for packages without TypeScript definitions
 */

declare module "@modelcontextprotocol/sdk/types" {
  import type { ZodSchema } from 'zod';
  export const ListToolsRequestSchema: ZodSchema;
  export const CallToolRequestSchema: ZodSchema;
}

declare module "@modelcontextprotocol/sdk/server/stdio" {
  /** Message structure for MCP protocol */
  interface MCPMessage {
    jsonrpc: string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
    id?: string | number;
  }

  /** Options for sending messages */
  interface SendOptions {
    timeout?: number;
  }

  export class StdioServerTransport {
    constructor(options?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream });
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: MCPMessage, options?: SendOptions): Promise<void>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: MCPMessage) => void;
  }
}

declare module "@modelcontextprotocol/sdk/dist/esm/server/stdio.js" {
  /** Message structure for MCP protocol */
  interface MCPMessage {
    jsonrpc: string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
    id?: string | number;
  }

  /** Options for sending messages */
  interface SendOptions {
    timeout?: number;
  }

  export class StdioServerTransport {
    constructor(options?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream });
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: MCPMessage, options?: SendOptions): Promise<void>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: MCPMessage) => void;
  }
}
