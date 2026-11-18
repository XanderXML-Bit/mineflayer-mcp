/**
 * Type augmentations for mineflayer
 *
 * Extends mineflayer types with properties that exist at runtime
 * but are not in the official type definitions.
 */

import 'mineflayer';

/** Pathfinder goal interface */
interface PathfinderGoal {
  x?: number;
  y?: number;
  z?: number;
  range?: number;
  entity?: object;
  isEnd?: (node: object) => boolean;
  hasChanged?: () => boolean;
}

/** Pathfinder movements configuration */
interface PathfinderMovements {
  canDig?: boolean;
  canSwim?: boolean;
  canWalkOnLava?: boolean;
  dontMineUnderFallingBlock?: boolean;
  allowSprinting?: boolean;
  allowParkour?: boolean;
  maxDropDown?: number;
  bot?: object;
}

/** NBT projectile data structure */
interface NBTProjectile {
  id?: { value: string };
  Count?: { value: number };
  tag?: { value: unknown };
}

declare module 'mineflayer' {
  interface Bot {
    /** Thunder state (0 = no thunder, >0 = thundering) */
    thunderState?: number;

    /** Oxygen level (0-20, 20 = full breath) */
    oxygenLevel: number;

    /** Game state information */
    game?: {
      /** Current dimension (overworld, the_nether, the_end) */
      dimension?: string;
      /** Game difficulty */
      difficulty?: string;
      /** Game mode (numeric: 0=survival, 1=creative, 2=adventure, 3=spectator) */
      gameMode?: number;
      /** Is hardcore mode */
      hardcore?: boolean;
      /** Max players on server */
      maxPlayers?: number;
      /** Level type */
      levelType?: string;
    };

    /** Pathfinder plugin (optional, may not be loaded) */
    pathfinder?: {
      goto: (goal: PathfinderGoal) => Promise<void>;
      setGoal: (goal: PathfinderGoal | null, dynamic?: boolean) => void;
      setMovements: (movements: PathfinderMovements) => void;
      stop: () => void;
      isMoving: () => boolean;
      isMining: () => boolean;
      isBuilding: () => boolean;
    };
  }

  interface Entity {
    /** Whether entity is in water */
    isInWater?: boolean;
    /** Whether entity is flying with elytra */
    elytraFlying?: boolean;
    /** Entity display name */
    displayName?: string;
    /** Entity custom name */
    customName?: string;
  }

  interface Item {
    /** NBT data for the item */
    nbt?: {
      value?: {
        /** Enchantments on the item */
        Enchantments?: {
          value?: {
            value?: Array<{
              id: { value: string };
              lvl: { value: number };
            }>;
          };
        };
        /** Charged projectiles (for crossbows) */
        ChargedProjectiles?: {
          value?: {
            value?: NBTProjectile[];
          };
        };
        /** Damage/durability used */
        Damage?: { value: number };
      };
    };
    /** Durability used on item */
    durabilityUsed?: number;
  }

  interface Block {
    /** Block material type */
    material?: string;
    /** Block hardness */
    hardness?: number;
    /** Whether block is diggable */
    diggable?: boolean;
  }
}

// Extend prismarine-item if needed
declare module 'prismarine-item' {
  interface Item {
    /** NBT data for the item */
    nbt?: {
      value?: {
        Enchantments?: {
          value?: {
            value?: Array<{
              id: { value: string };
              lvl: { value: number };
            }>;
          };
        };
        ChargedProjectiles?: {
          value?: {
            value?: NBTProjectile[];
          };
        };
        Damage?: { value: number };
      };
    };
    durabilityUsed?: number;
  }
}
