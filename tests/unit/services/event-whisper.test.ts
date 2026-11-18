/**
 * Whisper events: Mineflayer 'whisper' must surface as player_whisper and reach
 * tool responses as recentChat entries with isWhisper: true.
 */

import { EventEmitter } from 'node:events';
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import { z } from 'zod';
import type { AppConfig } from '../../../src/config/index.js';
import type { ToolSuccess } from '../../../src/types/tool.js';
import {
  attachEventListeners,
  detachEventListeners,
  peekEvents,
} from '../../../src/services/event.service.js';
import { BaseTool, BaseInputSchema, type ToolContext } from '../../../src/tools/base-tool.js';

class NoopTool extends BaseTool<{ username?: string }, { done: boolean }> {
  readonly name = 'noopTool';
  readonly description = 'Does nothing';
  readonly category = 'utility' as const;
  readonly inputSchema = BaseInputSchema.extend({ extra: z.string().optional() });

  protected async execute(): Promise<{ done: boolean }> {
    return { done: true };
  }
}

function createEmitterBot(): Bot {
  const position = {
    x: 0,
    y: 64,
    z: 0,
    floored: () => position,
    offset: (dx: number, dy: number, dz: number) => ({
      x: position.x + dx,
      y: position.y + dy,
      z: position.z + dz,
      floored: () => position,
    }),
    clone: () => position,
    distanceTo: () => 100,
  };
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    username: 'TestBot',
    health: 20,
    food: 20,
    foodSaturation: 5,
    entity: { position, onGround: true },
    entities: {},
    inventory: { items: () => [] },
    oxygenLevel: 20,
    time: { timeOfDay: 6000 },
    blockAt: () => ({ name: 'grass_block', biome: { name: 'plains' } }),
    __status: null,
    __chatLog: [],
  }) as unknown as Bot;
}

describe('whisper events', () => {
  let bot: Bot | undefined;

  afterEach(() => {
    if (bot) detachEventListeners(bot);
    bot = undefined;
  });

  it('buffers a Mineflayer whisper as player_whisper', () => {
    bot = createEmitterBot();
    attachEventListeners(bot, {} as AppConfig);

    bot.emit('whisper', 'Alice', 'meet at spawn');

    const whispers = peekEvents(bot).filter((e) => e.type === 'player_whisper');
    expect(whispers).toHaveLength(1);
    expect(whispers[0].data).toEqual({ username: 'Alice', message: 'meet at spawn' });
  });

  it('ignores whispers sent by the bot itself', () => {
    bot = createEmitterBot();
    attachEventListeners(bot, {} as AppConfig);

    bot.emit('whisper', 'TestBot', 'echo');

    expect(peekEvents(bot).some((e) => e.type === 'player_whisper')).toBe(false);
  });

  it('reports whispers in recentChat with isWhisper and excludes them from events', async () => {
    bot = createEmitterBot();
    attachEventListeners(bot, {} as AppConfig);

    bot.emit('chat', 'Bob', 'hello all');
    bot.emit('whisper', 'Alice', 'psst');
    bot.emit('death');

    const context: ToolContext = {
      getBotOrThrow: vi.fn().mockReturnValue(bot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', bot]])),
      config: {} as unknown as ToolContext['config'],
    };
    const response = await new NoopTool(context).run({});

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const result = response as ToolSuccess<{ done: boolean }>;
    expect(result.recentChat).toEqual([
      expect.objectContaining({ from: 'Bob', message: 'hello all', isWhisper: false }),
      expect.objectContaining({ from: 'Alice', message: 'psst', isWhisper: true }),
    ]);
    const otherTypes = (result.events ?? []).map((e: { type: string }) => e.type);
    expect(otherTypes).toContain('death');
    expect(otherTypes).not.toContain('player_whisper');
    expect(otherTypes).not.toContain('player_chat');
  });

  it('removes the whisper listener on detach', () => {
    bot = createEmitterBot();
    attachEventListeners(bot, {} as AppConfig);
    expect(bot.listenerCount('whisper')).toBe(1);

    detachEventListeners(bot);
    expect(bot.listenerCount('whisper')).toBe(0);
    bot = undefined;
  });
});
