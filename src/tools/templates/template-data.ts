/**
 * Building Template Data
 * Pre-defined structure templates for the bot to build
 */

export interface BlockPlacement {
  x: number;
  y: number;
  z: number;
  block: string;
}

export interface BuildingTemplate {
  name: string;
  description: string;
  size: { x: number; y: number; z: number };
  blocks: BlockPlacement[];
  requirements: Record<string, number>;
}

// Simple 5x3x5 shelter
const SHELTER_BASIC: BuildingTemplate = {
  name: 'shelter_basic',
  description: 'A simple 5x3x5 cobblestone shelter with door',
  size: { x: 5, y: 3, z: 5 },
  blocks: [
    // Floor
    { x: 0, y: 0, z: 0, block: 'cobblestone' },
    { x: 1, y: 0, z: 0, block: 'cobblestone' },
    { x: 2, y: 0, z: 0, block: 'cobblestone' },
    { x: 3, y: 0, z: 0, block: 'cobblestone' },
    { x: 4, y: 0, z: 0, block: 'cobblestone' },
    { x: 0, y: 0, z: 1, block: 'cobblestone' },
    { x: 1, y: 0, z: 1, block: 'cobblestone' },
    { x: 2, y: 0, z: 1, block: 'cobblestone' },
    { x: 3, y: 0, z: 1, block: 'cobblestone' },
    { x: 4, y: 0, z: 1, block: 'cobblestone' },
    { x: 0, y: 0, z: 2, block: 'cobblestone' },
    { x: 1, y: 0, z: 2, block: 'cobblestone' },
    { x: 2, y: 0, z: 2, block: 'cobblestone' },
    { x: 3, y: 0, z: 2, block: 'cobblestone' },
    { x: 4, y: 0, z: 2, block: 'cobblestone' },
    { x: 0, y: 0, z: 3, block: 'cobblestone' },
    { x: 1, y: 0, z: 3, block: 'cobblestone' },
    { x: 2, y: 0, z: 3, block: 'cobblestone' },
    { x: 3, y: 0, z: 3, block: 'cobblestone' },
    { x: 4, y: 0, z: 3, block: 'cobblestone' },
    { x: 0, y: 0, z: 4, block: 'cobblestone' },
    { x: 1, y: 0, z: 4, block: 'cobblestone' },
    { x: 2, y: 0, z: 4, block: 'cobblestone' },
    { x: 3, y: 0, z: 4, block: 'cobblestone' },
    { x: 4, y: 0, z: 4, block: 'cobblestone' },
    // Walls - Layer 1
    { x: 0, y: 1, z: 0, block: 'cobblestone' },
    { x: 1, y: 1, z: 0, block: 'cobblestone' },
    // Door opening at x=2
    { x: 3, y: 1, z: 0, block: 'cobblestone' },
    { x: 4, y: 1, z: 0, block: 'cobblestone' },
    { x: 0, y: 1, z: 1, block: 'cobblestone' },
    { x: 4, y: 1, z: 1, block: 'cobblestone' },
    { x: 0, y: 1, z: 2, block: 'cobblestone' },
    { x: 4, y: 1, z: 2, block: 'cobblestone' },
    { x: 0, y: 1, z: 3, block: 'cobblestone' },
    { x: 4, y: 1, z: 3, block: 'cobblestone' },
    { x: 0, y: 1, z: 4, block: 'cobblestone' },
    { x: 1, y: 1, z: 4, block: 'cobblestone' },
    { x: 2, y: 1, z: 4, block: 'cobblestone' },
    { x: 3, y: 1, z: 4, block: 'cobblestone' },
    { x: 4, y: 1, z: 4, block: 'cobblestone' },
    // Walls - Layer 2
    { x: 0, y: 2, z: 0, block: 'cobblestone' },
    { x: 1, y: 2, z: 0, block: 'cobblestone' },
    // Door opening at x=2
    { x: 3, y: 2, z: 0, block: 'cobblestone' },
    { x: 4, y: 2, z: 0, block: 'cobblestone' },
    { x: 0, y: 2, z: 1, block: 'cobblestone' },
    { x: 4, y: 2, z: 1, block: 'cobblestone' },
    { x: 0, y: 2, z: 2, block: 'cobblestone' },
    { x: 4, y: 2, z: 2, block: 'cobblestone' },
    { x: 0, y: 2, z: 3, block: 'cobblestone' },
    { x: 4, y: 2, z: 3, block: 'cobblestone' },
    { x: 0, y: 2, z: 4, block: 'cobblestone' },
    { x: 1, y: 2, z: 4, block: 'cobblestone' },
    { x: 2, y: 2, z: 4, block: 'cobblestone' },
    { x: 3, y: 2, z: 4, block: 'cobblestone' },
    { x: 4, y: 2, z: 4, block: 'cobblestone' },
    // Roof
    { x: 0, y: 3, z: 0, block: 'cobblestone' },
    { x: 1, y: 3, z: 0, block: 'cobblestone' },
    { x: 2, y: 3, z: 0, block: 'cobblestone' },
    { x: 3, y: 3, z: 0, block: 'cobblestone' },
    { x: 4, y: 3, z: 0, block: 'cobblestone' },
    { x: 0, y: 3, z: 1, block: 'cobblestone' },
    { x: 1, y: 3, z: 1, block: 'cobblestone' },
    { x: 2, y: 3, z: 1, block: 'cobblestone' },
    { x: 3, y: 3, z: 1, block: 'cobblestone' },
    { x: 4, y: 3, z: 1, block: 'cobblestone' },
    { x: 0, y: 3, z: 2, block: 'cobblestone' },
    { x: 1, y: 3, z: 2, block: 'cobblestone' },
    { x: 2, y: 3, z: 2, block: 'cobblestone' },
    { x: 3, y: 3, z: 2, block: 'cobblestone' },
    { x: 4, y: 3, z: 2, block: 'cobblestone' },
    { x: 0, y: 3, z: 3, block: 'cobblestone' },
    { x: 1, y: 3, z: 3, block: 'cobblestone' },
    { x: 2, y: 3, z: 3, block: 'cobblestone' },
    { x: 3, y: 3, z: 3, block: 'cobblestone' },
    { x: 4, y: 3, z: 3, block: 'cobblestone' },
    { x: 0, y: 3, z: 4, block: 'cobblestone' },
    { x: 1, y: 3, z: 4, block: 'cobblestone' },
    { x: 2, y: 3, z: 4, block: 'cobblestone' },
    { x: 3, y: 3, z: 4, block: 'cobblestone' },
    { x: 4, y: 3, z: 4, block: 'cobblestone' },
  ],
  requirements: { cobblestone: 75 },
};

// 9x9 wheat farm with water
const FARM_WHEAT: BuildingTemplate = {
  name: 'farm_wheat',
  description: 'A 9x9 wheat farm with central water source',
  size: { x: 9, y: 2, z: 9 },
  blocks: [
    // Water in center
    { x: 4, y: 0, z: 4, block: 'water' },
    // Farmland around water (8x8 minus center)
    ...Array.from({ length: 9 }, (_, x) =>
      Array.from({ length: 9 }, (_, z) => {
        if (x === 4 && z === 4) return null; // Skip water
        return { x, y: 0, z, block: 'farmland' };
      })
    ).flat().filter((b): b is BlockPlacement => b !== null),
  ],
  requirements: { water_bucket: 1, 'wooden_hoe': 1 },
};

// Simple 3x3 mine entrance
const MINE_ENTRANCE: BuildingTemplate = {
  name: 'mine_entrance',
  description: 'A 3x3 staircase mine entrance going down 10 blocks',
  size: { x: 3, y: 10, z: 3 },
  blocks: [
    // Staircase pattern (descending)
    ...Array.from({ length: 10 }, (_, i) => [
      { x: 1, y: -i, z: i % 3, block: 'cobblestone_stairs' },
      { x: 0, y: -i, z: i % 3, block: 'cobblestone' },
      { x: 2, y: -i, z: i % 3, block: 'cobblestone' },
    ]).flat(),
  ],
  requirements: { cobblestone_stairs: 10, cobblestone: 20 },
};

// Small storage room with chests
const STORAGE_ROOM: BuildingTemplate = {
  name: 'storage_room',
  description: 'A 7x4x7 storage room with chest slots',
  size: { x: 7, y: 4, z: 7 },
  blocks: [
    // Floor
    ...Array.from({ length: 7 }, (_, x) =>
      Array.from({ length: 7 }, (_, z) =>
        ({ x, y: 0, z, block: 'stone_bricks' })
      )
    ).flat(),
    // Walls (layer 1-3)
    ...Array.from({ length: 3 }, (_, layer) => [
      // Front and back walls
      ...Array.from({ length: 7 }, (_, x) => [
        { x, y: layer + 1, z: 0, block: 'stone_bricks' },
        { x, y: layer + 1, z: 6, block: 'stone_bricks' },
      ]).flat(),
      // Side walls
      ...Array.from({ length: 5 }, (_, z) => [
        { x: 0, y: layer + 1, z: z + 1, block: 'stone_bricks' },
        { x: 6, y: layer + 1, z: z + 1, block: 'stone_bricks' },
      ]).flat(),
    ]).flat(),
    // Roof
    ...Array.from({ length: 7 }, (_, x) =>
      Array.from({ length: 7 }, (_, z) =>
        ({ x, y: 4, z, block: 'stone_bricks' })
      )
    ).flat(),
    // Torches
    { x: 1, y: 2, z: 1, block: 'torch' },
    { x: 5, y: 2, z: 1, block: 'torch' },
    { x: 1, y: 2, z: 5, block: 'torch' },
    { x: 5, y: 2, z: 5, block: 'torch' },
  ],
  requirements: { stone_bricks: 140, torch: 4 },
};

// Watchtower
const WATCHTOWER: BuildingTemplate = {
  name: 'watchtower',
  description: 'A 5x12x5 watchtower with ladder access',
  size: { x: 5, y: 12, z: 5 },
  blocks: [
    // Base floor
    ...Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, z) =>
        ({ x, y: 0, z, block: 'cobblestone' })
      )
    ).flat(),
    // Corner pillars (10 blocks high)
    ...Array.from({ length: 10 }, (_, y) => [
      { x: 0, y: y + 1, z: 0, block: 'cobblestone' },
      { x: 4, y: y + 1, z: 0, block: 'cobblestone' },
      { x: 0, y: y + 1, z: 4, block: 'cobblestone' },
      { x: 4, y: y + 1, z: 4, block: 'cobblestone' },
    ]).flat(),
    // Ladder inside
    ...Array.from({ length: 10 }, (_, y) =>
      ({ x: 2, y: y + 1, z: 3, block: 'ladder' })
    ),
    // Top platform
    ...Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, z) =>
        ({ x, y: 11, z, block: 'oak_planks' })
      )
    ).flat(),
    // Railings
    ...Array.from({ length: 5 }, (_, i) => [
      { x: i, y: 12, z: 0, block: 'oak_fence' },
      { x: i, y: 12, z: 4, block: 'oak_fence' },
      { x: 0, y: 12, z: i, block: 'oak_fence' },
      { x: 4, y: 12, z: i, block: 'oak_fence' },
    ]).flat(),
  ],
  requirements: { cobblestone: 65, ladder: 10, oak_planks: 25, oak_fence: 16 },
};

// All available templates
export const BUILDING_TEMPLATES: Record<string, BuildingTemplate> = {
  shelter_basic: SHELTER_BASIC,
  farm_wheat: FARM_WHEAT,
  mine_entrance: MINE_ENTRANCE,
  storage_room: STORAGE_ROOM,
  watchtower: WATCHTOWER,
};

export function getTemplate(name: string): BuildingTemplate | undefined {
  return BUILDING_TEMPLATES[name];
}

export function listTemplates(): string[] {
  return Object.keys(BUILDING_TEMPLATES);
}
