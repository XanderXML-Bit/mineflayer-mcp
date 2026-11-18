/**
 * Brewing Recipes Data
 * Contains all brewing recipes for potions
 */

export interface BrewingRecipe {
  input: string;
  ingredient: string;
  output: string;
  description: string;
}

// Base potion recipes (water bottle -> base)
export const BASE_RECIPES: BrewingRecipe[] = [
  { input: 'potion', ingredient: 'nether_wart', output: 'awkward_potion', description: 'Creates base for most potions' },
  { input: 'potion', ingredient: 'glowstone_dust', output: 'thick_potion', description: 'Base potion (unused)' },
  { input: 'potion', ingredient: 'redstone', output: 'mundane_potion', description: 'Base potion (unused)' },
  { input: 'potion', ingredient: 'fermented_spider_eye', output: 'potion_of_weakness', description: 'Weakness potion directly' },
];

// Effect potion recipes (awkward potion -> effect potion)
export const EFFECT_RECIPES: BrewingRecipe[] = [
  { input: 'awkward_potion', ingredient: 'golden_carrot', output: 'potion_of_night_vision', description: 'See in the dark (3:00)' },
  { input: 'awkward_potion', ingredient: 'magma_cream', output: 'potion_of_fire_resistance', description: 'Immune to fire damage (3:00)' },
  { input: 'awkward_potion', ingredient: 'rabbit_foot', output: 'potion_of_leaping', description: 'Jump higher (3:00)' },
  { input: 'awkward_potion', ingredient: 'sugar', output: 'potion_of_swiftness', description: 'Move faster (3:00)' },
  { input: 'awkward_potion', ingredient: 'glistering_melon_slice', output: 'potion_of_healing', description: 'Instant health' },
  { input: 'awkward_potion', ingredient: 'spider_eye', output: 'potion_of_poison', description: 'Poison (0:45)' },
  { input: 'awkward_potion', ingredient: 'ghast_tear', output: 'potion_of_regeneration', description: 'Regenerate health (0:45)' },
  { input: 'awkward_potion', ingredient: 'blaze_powder', output: 'potion_of_strength', description: 'Increased melee damage (3:00)' },
  { input: 'awkward_potion', ingredient: 'turtle_helmet', output: 'potion_of_the_turtle_master', description: 'Slowness + Resistance (0:20)' },
  { input: 'awkward_potion', ingredient: 'phantom_membrane', output: 'potion_of_slow_falling', description: 'Fall slowly (1:30)' },
  { input: 'awkward_potion', ingredient: 'pufferfish', output: 'potion_of_water_breathing', description: 'Breathe underwater (3:00)' },
];

// Modifier recipes (enhance existing potions)
export const MODIFIER_RECIPES: BrewingRecipe[] = [
  // Glowstone - increase potency (shorter duration)
  { input: 'potion_of_healing', ingredient: 'glowstone_dust', output: 'potion_of_healing_ii', description: 'Stronger healing' },
  { input: 'potion_of_swiftness', ingredient: 'glowstone_dust', output: 'potion_of_swiftness_ii', description: 'Faster movement' },
  { input: 'potion_of_strength', ingredient: 'glowstone_dust', output: 'potion_of_strength_ii', description: 'More damage' },
  { input: 'potion_of_poison', ingredient: 'glowstone_dust', output: 'potion_of_poison_ii', description: 'Stronger poison' },
  { input: 'potion_of_regeneration', ingredient: 'glowstone_dust', output: 'potion_of_regeneration_ii', description: 'Faster regen' },
  { input: 'potion_of_leaping', ingredient: 'glowstone_dust', output: 'potion_of_leaping_ii', description: 'Higher jumps' },

  // Redstone - extend duration
  { input: 'potion_of_night_vision', ingredient: 'redstone', output: 'potion_of_night_vision_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_fire_resistance', ingredient: 'redstone', output: 'potion_of_fire_resistance_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_swiftness', ingredient: 'redstone', output: 'potion_of_swiftness_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_poison', ingredient: 'redstone', output: 'potion_of_poison_extended', description: 'Extended (1:30)' },
  { input: 'potion_of_regeneration', ingredient: 'redstone', output: 'potion_of_regeneration_extended', description: 'Extended (1:30)' },
  { input: 'potion_of_strength', ingredient: 'redstone', output: 'potion_of_strength_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_water_breathing', ingredient: 'redstone', output: 'potion_of_water_breathing_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_leaping', ingredient: 'redstone', output: 'potion_of_leaping_extended', description: 'Extended (8:00)' },
  { input: 'potion_of_slow_falling', ingredient: 'redstone', output: 'potion_of_slow_falling_extended', description: 'Extended (4:00)' },

  // Fermented spider eye - corrupt potion
  { input: 'potion_of_night_vision', ingredient: 'fermented_spider_eye', output: 'potion_of_invisibility', description: 'Become invisible' },
  { input: 'potion_of_leaping', ingredient: 'fermented_spider_eye', output: 'potion_of_slowness', description: 'Slow movement' },
  { input: 'potion_of_swiftness', ingredient: 'fermented_spider_eye', output: 'potion_of_slowness', description: 'Slow movement' },
  { input: 'potion_of_healing', ingredient: 'fermented_spider_eye', output: 'potion_of_harming', description: 'Instant damage' },
  { input: 'potion_of_poison', ingredient: 'fermented_spider_eye', output: 'potion_of_harming', description: 'Instant damage' },

  // Gunpowder - splash potion
  { input: 'any_potion', ingredient: 'gunpowder', output: 'splash_potion', description: 'Throwable potion' },

  // Dragon's breath - lingering potion
  { input: 'splash_potion', ingredient: 'dragons_breath', output: 'lingering_potion', description: 'Area effect potion' },
];

// All recipes combined
export const ALL_RECIPES: BrewingRecipe[] = [
  ...BASE_RECIPES,
  ...EFFECT_RECIPES,
  ...MODIFIER_RECIPES,
];

/**
 * Find recipes that produce a specific output
 */
export function findRecipesByOutput(outputName: string): BrewingRecipe[] {
  const normalized = outputName.toLowerCase().replace(/[_\s]/g, '');
  return ALL_RECIPES.filter(r => {
    const recipeOutput = r.output.toLowerCase().replace(/[_\s]/g, '');
    return recipeOutput.includes(normalized) || normalized.includes(recipeOutput);
  });
}

/**
 * Find recipes that use a specific ingredient
 */
export function findRecipesByIngredient(ingredientName: string): BrewingRecipe[] {
  const normalized = ingredientName.toLowerCase().replace(/[_\s]/g, '');
  return ALL_RECIPES.filter(r => {
    const ingredient = r.ingredient.toLowerCase().replace(/[_\s]/g, '');
    return ingredient.includes(normalized) || normalized.includes(ingredient);
  });
}

/**
 * Get brewing steps to create a specific potion from water bottles
 */
export function getBrewingPath(targetPotion: string): BrewingRecipe[] | null {
  const normalized = targetPotion.toLowerCase().replace(/[_\s]/g, '');

  // Direct match
  const directRecipe = ALL_RECIPES.find(r => {
    const output = r.output.toLowerCase().replace(/[_\s]/g, '');
    return output.includes(normalized) || normalized.includes(output);
  });

  if (!directRecipe) return null;

  const path: BrewingRecipe[] = [];

  // If it's a base recipe, just return it
  if (BASE_RECIPES.includes(directRecipe)) {
    path.push(directRecipe);
    return path;
  }

  // If it needs awkward potion, add that first
  if (directRecipe.input.includes('awkward')) {
    const awkwardRecipe = BASE_RECIPES.find(r => r.output === 'awkward_potion');
    if (awkwardRecipe) path.push(awkwardRecipe);
  }

  // Add the effect recipe
  if (EFFECT_RECIPES.includes(directRecipe)) {
    path.push(directRecipe);
    return path;
  }

  // If it's a modifier, find the base effect potion
  if (MODIFIER_RECIPES.includes(directRecipe)) {
    const baseEffect = EFFECT_RECIPES.find(r =>
      directRecipe.input.includes(r.output.replace('potion_of_', ''))
    );
    if (baseEffect) {
      const awkwardRecipe = BASE_RECIPES.find(r => r.output === 'awkward_potion');
      if (awkwardRecipe) path.push(awkwardRecipe);
      path.push(baseEffect);
    }
    path.push(directRecipe);
  }

  return path.length > 0 ? path : null;
}
