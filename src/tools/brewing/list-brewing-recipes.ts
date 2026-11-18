/**
 * List Brewing Recipes Tool
 * Lists brewing recipes and steps to create potions
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  EFFECT_RECIPES,
  findRecipesByOutput,
  findRecipesByIngredient,
  getBrewingPath,
  BrewingRecipe,
} from './brewing-recipes.js';

const InputSchema = BaseInputSchema.extend({
  potionName: z.string().optional().describe('Search for recipes that produce this potion'),
  ingredientName: z.string().optional().describe('Search for recipes using this ingredient'),
  showPath: z.boolean().optional().default(false).describe('Show full brewing path from water bottles'),
});

type Input = z.infer<typeof InputSchema>;

interface RecipeOutput {
  input: string;
  ingredient: string;
  output: string;
  description: string;
}

interface Output {
  recipes: RecipeOutput[];
  recipeCount: number;
  brewingPath?: RecipeOutput[];
  availableEffects?: string[];
}

export class ListBrewingRecipesTool extends BaseTool<Input, Output> {
  readonly name = 'listBrewingRecipes';
  readonly description = 'List brewing recipes for potions';
  readonly category = 'brewing' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    let recipes: BrewingRecipe[] = [];

    if (input.potionName) {
      recipes = findRecipesByOutput(input.potionName);

      // Also try to find brewing path
      if (input.showPath) {
        const path = getBrewingPath(input.potionName);
        if (path) {
          return {
            recipes: recipes.map(r => ({
              input: r.input,
              ingredient: r.ingredient,
              output: r.output,
              description: r.description,
            })),
            recipeCount: recipes.length,
            brewingPath: path.map(r => ({
              input: r.input,
              ingredient: r.ingredient,
              output: r.output,
              description: r.description,
            })),
          };
        }
      }
    } else if (input.ingredientName) {
      recipes = findRecipesByIngredient(input.ingredientName);
    } else {
      // Return list of all effect potions
      const availableEffects = EFFECT_RECIPES.map(r =>
        r.output.replace('potion_of_', '').replace(/_/g, ' ')
      );

      return {
        recipes: EFFECT_RECIPES.map(r => ({
          input: r.input,
          ingredient: r.ingredient,
          output: r.output,
          description: r.description,
        })),
        recipeCount: EFFECT_RECIPES.length,
        availableEffects,
      };
    }

    return {
      recipes: recipes.map(r => ({
        input: r.input,
        ingredient: r.ingredient,
        output: r.output,
        description: r.description,
      })),
      recipeCount: recipes.length,
    };
  }
}
