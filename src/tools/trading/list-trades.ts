/**
 * List Trades Tool
 * Lists available trades from a villager
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Villager data from metadata */
interface VillagerData {
  profession?: number;
  level?: number;
}

/** Metadata entry with villager data */
interface VillagerMetadataEntry {
  villagerData: VillagerData;
}

/** Trade item from window */
interface WindowTradeItem {
  name?: string;
  count?: number;
}

/** Trade from window */
interface WindowTrade {
  inputItem1?: WindowTradeItem;
  inputItem2?: WindowTradeItem;
  outputItem?: WindowTradeItem;
  disabled?: boolean;
  nbTradeUses?: number;
  maximumNbTradeUses?: number;
  traderExp?: number;
  xp?: number;
  priceMultiplier?: number;
}

/** Trade window interface */
interface TradeWindow {
  trades?: WindowTrade[];
  close(): void;
}

/** Bot with villager trading capability */
type BotWithTrading = Bot & {
  openVillager(villager: Entity): Promise<TradeWindow>;
};

const InputSchema = BaseInputSchema.extend({
  villagerEntityId: z.number().optional().describe('Entity ID of villager (finds nearest if omitted)'),
  profession: z.string().optional().describe('Find villager by profession if no entityId given'),
});

type Input = z.infer<typeof InputSchema>;

interface TradeItem {
  name: string;
  count: number;
}

interface TradeInfo {
  index: number;
  inputItem1: TradeItem;
  inputItem2?: TradeItem;
  outputItem: TradeItem;
  disabled: boolean;
  timesTraded: number;
  maxUses: number;
  xpReward: number;
  priceMultiplier: number;
}

interface Output {
  villagerEntityId: number;
  profession: string;
  level: number;
  trades: TradeInfo[];
  tradeCount: number;
}

export class ListTradesTool extends BaseTool<Input, Output> {
  readonly name = 'listTrades';
  readonly description = 'List available trades from a villager';
  readonly category = 'trading' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (_signal) => {
      // Find villager
      let villager = null;

      if (input.villagerEntityId) {
        villager = bot.entities[input.villagerEntityId];
        if (!villager || villager.name !== 'villager') {
          throw new Error(`No villager found with entity ID ${input.villagerEntityId}`);
        }
      } else {
        // Find nearest villager, optionally by profession
        let nearestDist = Infinity;
        for (const entity of Object.values(bot.entities)) {
          if (entity.name !== 'villager') continue;

          // Filter by profession if specified
          if (input.profession) {
            const metadata = entity.metadata;
            let professionId = 0;
            if (metadata) {
              for (const entry of metadata) {
                if (typeof entry === 'object' && entry !== null && 'villagerData' in entry) {
                  professionId = (entry as VillagerMetadataEntry).villagerData.profession || 0;
                }
              }
            }
            const professionName = getProfessionName(professionId);
            if (!professionName.toLowerCase().includes(input.profession.toLowerCase())) {
              continue;
            }
          }

          const dist = entity.position.distanceTo(bot.entity.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            villager = entity;
          }
        }

        if (!villager) {
          throw new Error(input.profession
            ? `No ${input.profession} villager found nearby`
            : 'No villager found nearby');
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
      const tradeWindow = await (bot as unknown as BotWithTrading).openVillager(villager);

      if (!tradeWindow) {
        throw new Error('Failed to open trade window with villager');
      }

      try {
        // Wait for trades to load
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get villager info from metadata
        let professionId = 0;
        let level = 1;
        const metadata = villager.metadata;
        if (metadata) {
          for (const entry of metadata) {
            if (typeof entry === 'object' && entry !== null && 'villagerData' in entry) {
              const vData = (entry as VillagerMetadataEntry).villagerData;
              professionId = vData.profession || 0;
              level = vData.level || 1;
            }
          }
        }

        // Parse trades
        const trades: TradeInfo[] = [];
        const windowTrades = (tradeWindow.trades || []) as WindowTrade[];

        for (let i = 0; i < windowTrades.length; i++) {
          const trade: WindowTrade = windowTrades[i];

          trades.push({
            index: i,
            inputItem1: {
              name: trade.inputItem1?.name || 'unknown',
              count: trade.inputItem1?.count || 1,
            },
            inputItem2: trade.inputItem2 ? {
              name: trade.inputItem2.name || 'unknown',
              count: trade.inputItem2.count || 1,
            } : undefined,
            outputItem: {
              name: trade.outputItem?.name || 'unknown',
              count: trade.outputItem?.count || 1,
            },
            disabled: trade.disabled || (trade.nbTradeUses ?? 0) >= (trade.maximumNbTradeUses ?? 12),
            timesTraded: trade.nbTradeUses || 0,
            maxUses: trade.maximumNbTradeUses || 12,
            xpReward: trade.traderExp || trade.xp || 0,
            priceMultiplier: trade.priceMultiplier || 1,
          });
        }

        tradeWindow.close();

        return {
          villagerEntityId: villager.id,
          profession: getProfessionName(professionId),
          level,
          trades,
          tradeCount: trades.length,
        };
      } catch (err) {
        tradeWindow.close();
        throw err;
      }
    });
  }
}

function getProfessionName(id: number): string {
  const names: Record<number, string> = {
    0: 'none',
    1: 'armorer',
    2: 'butcher',
    3: 'cartographer',
    4: 'cleric',
    5: 'farmer',
    6: 'fisherman',
    7: 'fletcher',
    8: 'leatherworker',
    9: 'librarian',
    10: 'mason',
    11: 'nitwit',
    12: 'shepherd',
    13: 'toolsmith',
    14: 'weaponsmith',
  };
  return names[id] || 'unknown';
}
