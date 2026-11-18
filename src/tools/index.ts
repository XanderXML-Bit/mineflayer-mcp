/**
 * Tools module exports
 */

// Base tool
export {
  BaseTool,
  BaseInputSchema,
  createTool,
  type BaseInput,
  type ToolContext,
} from './base-tool.js';

// Registry
export {
  ToolRegistry,
  createToolRegistry,
  getGlobalRegistry,
  setGlobalRegistry,
  ToolNotFoundError,
  DuplicateToolError,
} from './registry.js';

// Tool registration helpers
import type { ToolContext } from './base-tool.js';
import { ToolRegistry } from './registry.js';
import { logger } from '../utils/logger.js';

const log = logger.child('tools');

/**
 * Register all built-in tools
 *
 * This will be expanded as we migrate tools from the monolith
 */
export async function registerBuiltInTools(
  registry: ToolRegistry,
  context: ToolContext
): Promise<void> {
  log.info('Registering built-in tools...');

  // Import and register tool categories
  // These will be added as we extract tools from the monolith

  try {
    // Connection tools
    const { createConnectionTools } = await import('./connection/index.js');
    const connectionTools = createConnectionTools(context);
    registry.registerAll(connectionTools);
    log.debug(`Registered ${connectionTools.length} connection tools`);
  } catch (err) {
    log.warn('Failed to register connection tools', { error: err });
  }

  try {
    // Observation tools
    const { createObservationTools } = await import('./observation/index.js');
    const observationTools = createObservationTools(context);
    registry.registerAll(observationTools);
    log.debug(`Registered ${observationTools.length} observation tools`);
  } catch (err) {
    log.warn('Failed to register observation tools', { error: err });
  }

  try {
    // Communication tools
    const { createCommunicationTools } = await import('./communication/index.js');
    const communicationTools = createCommunicationTools(context);
    registry.registerAll(communicationTools);
    log.debug(`Registered ${communicationTools.length} communication tools`);
  } catch (err) {
    log.warn('Failed to register communication tools', { error: err });
  }

  try {
    // Movement tools
    const { createMovementTools } = await import('./movement/index.js');
    const movementTools = createMovementTools(context);
    registry.registerAll(movementTools);
    log.debug(`Registered ${movementTools.length} movement tools`);
  } catch (err) {
    log.warn('Failed to register movement tools', { error: err });
  }

  try {
    // Combat tools
    const { createCombatTools } = await import('./combat/index.js');
    const combatTools = createCombatTools(context);
    registry.registerAll(combatTools);
    log.debug(`Registered ${combatTools.length} combat tools`);
  } catch (err) {
    log.warn('Failed to register combat tools', { error: err });
  }

  try {
    // Inventory tools
    const { createInventoryTools } = await import('./inventory/index.js');
    const inventoryTools = createInventoryTools(context);
    registry.registerAll(inventoryTools);
    log.debug(`Registered ${inventoryTools.length} inventory tools`);
  } catch (err) {
    log.warn('Failed to register inventory tools', { error: err });
  }

  try {
    // Mining tools
    const { createMiningTools } = await import('./mining/index.js');
    const miningTools = createMiningTools(context);
    registry.registerAll(miningTools);
    log.debug(`Registered ${miningTools.length} mining tools`);
  } catch (err) {
    log.warn('Failed to register mining tools', { error: err });
  }

  try {
    // Crafting tools
    const { createCraftingTools } = await import('./crafting/index.js');
    const craftingTools = createCraftingTools(context);
    registry.registerAll(craftingTools);
    log.debug(`Registered ${craftingTools.length} crafting tools`);
  } catch (err) {
    log.warn('Failed to register crafting tools', { error: err });
  }

  try {
    // Cooking tools
    const { createCookingTools } = await import('./cooking/index.js');
    const cookingTools = createCookingTools(context);
    registry.registerAll(cookingTools);
    log.debug(`Registered ${cookingTools.length} cooking tools`);
  } catch (err) {
    log.warn('Failed to register cooking tools', { error: err });
  }

  try {
    // Storage tools
    const { createStorageTools } = await import('./storage/index.js');
    const storageTools = createStorageTools(context);
    registry.registerAll(storageTools);
    log.debug(`Registered ${storageTools.length} storage tools`);
  } catch (err) {
    log.warn('Failed to register storage tools', { error: err });
  }

  try {
    // Farming tools
    const { createFarmingTools } = await import('./farming/index.js');
    const farmingTools = createFarmingTools(context);
    registry.registerAll(farmingTools);
    log.debug(`Registered ${farmingTools.length} farming tools`);
  } catch (err) {
    log.warn('Failed to register farming tools', { error: err });
  }

  try {
    // Building tools
    const { createBuildingTools } = await import('./building/index.js');
    const buildingTools = createBuildingTools(context);
    registry.registerAll(buildingTools);
    log.debug(`Registered ${buildingTools.length} building tools`);
  } catch (err) {
    log.warn('Failed to register building tools', { error: err });
  }

  try {
    // Utility tools
    const { createUtilityTools } = await import('./utility/index.js');
    const utilityTools = createUtilityTools(context);
    registry.registerAll(utilityTools);
    log.debug(`Registered ${utilityTools.length} utility tools`);
  } catch (err) {
    log.warn('Failed to register utility tools', { error: err });
  }

  try {
    // Memory tools
    const { createMemoryTools } = await import('./memory/index.js');
    const memoryTools = createMemoryTools(context);
    registry.registerAll(memoryTools);
    log.debug(`Registered ${memoryTools.length} memory tools`);
  } catch (err) {
    log.warn('Failed to register memory tools', { error: err });
  }

  try {
    // Goal tools
    const { createGoalTools } = await import('./goals/index.js');
    const goalTools = createGoalTools(context);
    registry.registerAll(goalTools);
    log.debug(`Registered ${goalTools.length} goal tools`);
  } catch (err) {
    log.warn('Failed to register goal tools', { error: err });
  }

  try {
    // Navigation tools
    const { createNavigationTools } = await import('./navigation/index.js');
    const navigationTools = createNavigationTools(context);
    registry.registerAll(navigationTools);
    log.debug(`Registered ${navigationTools.length} navigation tools`);
  } catch (err) {
    log.warn('Failed to register navigation tools', { error: err });
  }

  try {
    // Enchanting tools
    const { createEnchantingTools } = await import('./enchanting/index.js');
    const enchantingTools = createEnchantingTools(context);
    registry.registerAll(enchantingTools);
    log.debug(`Registered ${enchantingTools.length} enchanting tools`);
  } catch (err) {
    log.warn('Failed to register enchanting tools', { error: err });
  }

  try {
    // Trading tools
    const { createTradingTools } = await import('./trading/index.js');
    const tradingTools = createTradingTools(context);
    registry.registerAll(tradingTools);
    log.debug(`Registered ${tradingTools.length} trading tools`);
  } catch (err) {
    log.warn('Failed to register trading tools', { error: err });
  }

  try {
    // Brewing tools
    const { createBrewingTools } = await import('./brewing/index.js');
    const brewingTools = createBrewingTools(context);
    registry.registerAll(brewingTools);
    log.debug(`Registered ${brewingTools.length} brewing tools`);
  } catch (err) {
    log.warn('Failed to register brewing tools', { error: err });
  }

  try {
    // Fishing tools
    const { createFishingTools } = await import('./fishing/index.js');
    const fishingTools = createFishingTools(context);
    registry.registerAll(fishingTools);
    log.debug(`Registered ${fishingTools.length} fishing tools`);
  } catch (err) {
    log.warn('Failed to register fishing tools', { error: err });
  }

  try {
    // Animal tools
    const { createAnimalTools } = await import('./animals/index.js');
    const animalTools = createAnimalTools(context);
    registry.registerAll(animalTools);
    log.debug(`Registered ${animalTools.length} animal tools`);
  } catch (err) {
    log.warn('Failed to register animal tools', { error: err });
  }

  try {
    // Anvil tools
    const { createAnvilTools } = await import('./anvil/index.js');
    const anvilTools = createAnvilTools(context);
    registry.registerAll(anvilTools);
    log.debug(`Registered ${anvilTools.length} anvil tools`);
  } catch (err) {
    log.warn('Failed to register anvil tools', { error: err });
  }

  try {
    // Portal tools
    const { createPortalTools } = await import('./portal/index.js');
    const portalTools = createPortalTools(context);
    registry.registerAll(portalTools);
    log.debug(`Registered ${portalTools.length} portal tools`);
  } catch (err) {
    log.warn('Failed to register portal tools', { error: err });
  }

  try {
    // Biome tools
    const { createBiomeTools } = await import('./biome/index.js');
    const biomeTools = createBiomeTools(context);
    registry.registerAll(biomeTools);
    log.debug(`Registered ${biomeTools.length} biome tools`);
  } catch (err) {
    log.warn('Failed to register biome tools', { error: err });
  }

  try {
    // Automation tools
    const { createAutomationTools } = await import('./automation/index.js');
    const automationTools = createAutomationTools(context);
    registry.registerAll(automationTools);
    log.debug(`Registered ${automationTools.length} automation tools`);
  } catch (err) {
    log.warn('Failed to register automation tools', { error: err });
  }

  try {
    // Stronghold & End tools
    const { createStrongholdTools } = await import('./stronghold/index.js');
    const strongholdTools = createStrongholdTools(context);
    registry.registerAll(strongholdTools);
    log.debug(`Registered ${strongholdTools.length} stronghold tools`);
  } catch (err) {
    log.warn('Failed to register stronghold tools', { error: err });
  }

  try {
    // Template tools
    const { createTemplateTools } = await import('./templates/index.js');
    const templateTools = createTemplateTools(context);
    registry.registerAll(templateTools);
    log.debug(`Registered ${templateTools.length} template tools`);
  } catch (err) {
    log.warn('Failed to register template tools', { error: err });
  }

  try {
    // Multi-bot tools
    const { createMultiBotTools } = await import('./multibot/index.js');
    const multiBotTools = createMultiBotTools(context);
    registry.registerAll(multiBotTools);
    log.debug(`Registered ${multiBotTools.length} multi-bot tools`);
  } catch (err) {
    log.warn('Failed to register multi-bot tools', { error: err });
  }

  try {
    // Skills tools (Skill Library)
    const { createSkillsTools } = await import('./skills/index.js');
    const skillsTools = createSkillsTools(context);
    registry.registerAll(skillsTools);
    log.debug(`Registered ${skillsTools.length} skills tools`);
  } catch (err) {
    log.warn('Failed to register skills tools', { error: err });
  }

  try {
    // Reflection tools (Learning from outcomes)
    const { createReflectionTools } = await import('./reflection/index.js');
    const reflectionTools = createReflectionTools(context);
    registry.registerAll(reflectionTools);
    log.debug(`Registered ${reflectionTools.length} reflection tools`);
  } catch (err) {
    log.warn('Failed to register reflection tools', { error: err });
  }

  log.info(`Registered ${registry.size} tools`);
}
