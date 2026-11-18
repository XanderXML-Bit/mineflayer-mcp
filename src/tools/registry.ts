/**
 * Tool registry for managing and discovering tools
 */

import type { ToolDefinition, ToolResult, ToolCategory } from '../types/index.js';
import type { BaseTool, BaseInput } from './base-tool.js';
import { logger } from '../utils/logger.js';

const log = logger.child('registry');

/**
 * Error thrown when a tool is not found
 */
export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool '${name}' not found`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Error thrown when a tool is already registered
 */
export class DuplicateToolError extends Error {
  constructor(name: string) {
    super(`Tool '${name}' is already registered`);
    this.name = 'DuplicateToolError';
  }
}

/**
 * Tool registry for managing MCP tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool<BaseInput, unknown>> = new Map();
  private toolsByCategory: Map<ToolCategory, Set<string>> = new Map();

  /**
   * Register a tool
   */
  register(tool: BaseTool<BaseInput, unknown>): void {
    if (this.tools.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }

    this.tools.set(tool.name, tool);

    // Track by category
    if (!this.toolsByCategory.has(tool.category)) {
      this.toolsByCategory.set(tool.category, new Set());
    }
    const categorySet = this.toolsByCategory.get(tool.category);
    if (categorySet) {
      categorySet.add(tool.name);
    }

    log.debug(`Registered tool: ${tool.name} (${tool.category})`);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: BaseTool<BaseInput, unknown>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): BaseTool<BaseInput, unknown> | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a tool by name or throw
   */
  getOrThrow(name: string): BaseTool<BaseInput, unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.getOrThrow(name);
    return tool.run(args);
  }

  /**
   * Get all tool definitions for MCP
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
  }

  /**
   * Get all tool names
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): BaseTool<BaseInput, unknown>[] {
    const names = this.toolsByCategory.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.tools.get(name))
      .filter((tool): tool is BaseTool<BaseInput, unknown> => tool !== undefined);
  }

  /**
   * Get all categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.toolsByCategory.keys());
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
  }
}

/**
 * Create a tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * Global tool registry instance
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry
 */
export function getGlobalRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = createToolRegistry();
  }
  return globalRegistry;
}

/**
 * Set the global tool registry
 */
export function setGlobalRegistry(registry: ToolRegistry): void {
  globalRegistry = registry;
}
