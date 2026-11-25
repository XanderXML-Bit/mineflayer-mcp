/**
 * Trade With Villager Tool
 * Execute a trade with a villager
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Trade item information */
interface TradeItem {
  type: number;
  metadata?: number | null;
  count: number;
  name: string;
}

/** Villager trade */
interface VillagerTrade {
  inputItem1: TradeItem;
  inputItem2?: TradeItem;
  outputItem: TradeItem;
  disabled?: boolean;
  nbTradeUses: number;
  maximumNbTradeUses: number;
}

/** Villager trade window */
interface VillagerWindow {
  trades: VillagerTrade[];
  trade(index: number): Promise<void>;
  close(): void;
}

const InputSchema = BaseInputSchema.extend({
  villagerEntityId: z.number().optional().describe('Entity ID of villager (finds nearest if omitted)'),
  tradeIndex: z.number().describe('Index of the trade to execute (from listTrades)'),
  count: z.number().optional().default(1).describe('Number of times to execute the trade'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  tradesExecuted: number;
  itemReceived?: { name: string; count: number };
  itemsGiven?: { name: string; count: number }[];
  error?: string;
  tradeDisabled?: boolean;
}

export class TradeWithVillagerTool extends BaseTool<Input, Output> {
  readonly name = 'tradeWithVillager';
  readonly description = 'Execute a trade with a villager';
  readonly category = 'trading' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { tradeIndex } = input;
      const tradeCount = input.count ?? 1;

      // Find villager
      let villager: Entity | null = null;

      if (input.villagerEntityId) {
        const entity = bot.entities[input.villagerEntityId];
        if (!entity || entity.name !== 'villager') {
          return { success: false, tradesExecuted: 0, error: `No villager with ID ${input.villagerEntityId}` };
        }
        villager = entity;
      } else {
        // Find nearest villager
        let nearestDist = Infinity;
        for (const entity of Object.values(bot.entities)) {
          if (entity.name !== 'villager') continue;
          const dist = entity.position.distanceTo(bot.entity.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            villager = entity;
          }
        }

        if (!villager) {
          return { success: false, tradesExecuted: 0, error: 'No villager found nearby' };
        }
      }

      // Navigate to villager if needed
      const distance = villager.position.distanceTo(bot.entity.position);
      if (distance > 4) {
        const { GoalNear } = goals;
        await bot.pathfinder.goto(new GoalNear(
          villager.position.x,
          villager.position.y,
          villager.position.z,
          2
        ));
      }

      // Open trade window
      const rawWindow = await bot.openVillager(villager);
      const tradeWindow = rawWindow as unknown as VillagerWindow;

      if (!tradeWindow) {
        return { success: false, tradesExecuted: 0, error: 'Failed to open trade window' };
      }

      try {
        // Wait for trades to load
        await new Promise(resolve => setTimeout(resolve, 300));

        const windowTrades = tradeWindow.trades || [];

        if (tradeIndex < 0 || tradeIndex >= windowTrades.length) {
          tradeWindow.close();
          return {
            success: false,
            tradesExecuted: 0,
            error: `Invalid trade index ${tradeIndex}. Available: 0-${windowTrades.length - 1}`
          };
        }

        const trade = windowTrades[tradeIndex];

        // Check if trade is disabled
        if (trade.disabled || trade.nbTradeUses >= trade.maximumNbTradeUses) {
          tradeWindow.close();
          return {
            success: false,
            tradesExecuted: 0,
            error: 'Trade is disabled or out of stock',
            tradeDisabled: true
          };
        }

        // Check if we have the required items
        const input1 = trade.inputItem1;
        const input2 = trade.inputItem2;

        // Count items by type (using item type ID and optional metadata)
        const countItem = (itemType: number, metadata?: number | null) => {
          return bot.inventory.items().filter(i => {
            if (i.type !== itemType) return false;
            if (metadata !== null && i.metadata !== metadata) return false;
            return true;
          }).reduce((sum, i) => sum + i.count, 0);
        };

        const input1Count = countItem(input1.type, input1.metadata);
        const hasInput1 = input1Count >= input1.count * tradeCount;
        const input2Count = input2 ? countItem(input2.type, input2.metadata) : 0;
        const hasInput2 = !input2 || input2Count >= input2.count * tradeCount;

        if (!hasInput1) {
          tradeWindow.close();
          return {
            success: false,
            tradesExecuted: 0,
            error: `Not enough ${input1.name}. Need ${input1.count * tradeCount}, have ${input1Count}`
          };
        }

        if (!hasInput2 && input2) {
          tradeWindow.close();
          return {
            success: false,
            tradesExecuted: 0,
            error: `Not enough ${input2.name}. Need ${input2.count * tradeCount}, have ${input2Count}`
          };
        }

        // Execute trades
        let tradesExecuted = 0;
        const remainingUses = trade.maximumNbTradeUses - trade.nbTradeUses;
        const maxTrades = Math.min(tradeCount, remainingUses);

        for (let i = 0; i < maxTrades; i++) {
          if (aborted) break;

          try {
            // Use the trade method with just the index
            await tradeWindow.trade(tradeIndex);
            tradesExecuted++;
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch {
            // Trade failed, might be out of stock
            break;
          }
        }

        const output = trade.outputItem;
        const itemsGiven: { name: string; count: number }[] = [
          { name: input1.name, count: input1.count * tradesExecuted }
        ];
        if (input2) {
          itemsGiven.push({ name: input2.name, count: input2.count * tradesExecuted });
        }

        tradeWindow.close();

        return {
          success: tradesExecuted > 0,
          tradesExecuted,
          itemReceived: {
            name: output.name,
            count: output.count * tradesExecuted
          },
          itemsGiven,
        };
      } catch (err) {
        tradeWindow.close();
        throw err;
      }
    });
  }
}
