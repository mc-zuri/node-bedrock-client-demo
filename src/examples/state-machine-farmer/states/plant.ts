import { StateBehavior } from '@nxg-org/mineflayer-static-statemachine';
import mineflayerPathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayerPathfinder;
import { Vec3 } from 'vec3';
import type { FarmingContext } from '../context.ts';
import { SEED_TYPES } from '../constants.ts';
import { sleep } from '../utils/index.ts';

export class PlantState extends StateBehavior {
  name = 'plant';
  private done = false;

  get ctx(): FarmingContext | undefined {
    return this.bot.farmingContext;
  }

  isFinished(): boolean {
    return this.done;
  }

  async onStateEntered(): Promise<void> {
    this.done = false;
    this.bot.logger.debug('[Plant] State entered');

    if (!this.ctx) {
      this.bot.logger.debug('[Plant] No context, exiting');
      this.done = true;
      return;
    }

    this.ctx.planted = false;
    const farmlandPos = this.ctx.farmlandPosition || this.ctx.foundFarmland;
    const seedType = this.ctx.seedForReplant || this.getLowestInventorySeed();

    this.bot.logger.debug(`[Plant] farmlandPos=${farmlandPos}, seedType=${seedType}`);

    if (!farmlandPos || !seedType) {
      this.bot.logger.debug('[Plant] No farmland or seed available');
      this.done = true;
      return;
    }

    if (!this.ctx.seedForReplant) {
      this.bot.chat(`Planting ${seedType}`);
    }

    try {
      await this.plantSeed(farmlandPos, seedType);
    } catch (err) {
      this.bot.logger.error(`[Plant] Error: ${err}`);
    } finally {
      this.ctx.farmlandPosition = null;
      this.ctx.foundFarmland = null;
      this.ctx.seedForReplant = null;
      this.bot.logger.debug('[Plant] State done');
      this.done = true;
    }
  }

  private getLowestInventorySeed(): string | null {
    let result: string | null = null;
    let lowest = Infinity;

    for (const seed of SEED_TYPES) {
      const itemType = this.bot.registry.itemsByName[seed];
      if (!itemType) continue;
      const count = this.bot.inventory.count(itemType.id, null);
      if (count > 0 && count < lowest) {
        lowest = count;
        result = seed;
      }
    }
    return result;
  }

  private async plantSeed(farmlandPos: Vec3, seedType: string): Promise<void> {
    const seed = this.bot.inventory.slots.find((s) => s?.name === seedType);
    if (!seed) {
      this.bot.logger.debug(`[Plant] No ${seedType} in inventory`);
      return;
    }

    // Check farmland is still valid before navigating
    const farmland = this.bot.blockAt(farmlandPos);
    if (!farmland || farmland.name !== 'farmland') {
      this.bot.logger.debug(`[Plant] Farmland at ${farmlandPos} no longer valid`);
      return;
    }

    const above = this.bot.blockAt(farmlandPos.offset(0, 1, 0));
    if (above && above.name !== 'air') {
      this.bot.logger.debug(`[Plant] Farmland at ${farmlandPos} already has crop (${above.name})`);
      return;
    }

    this.bot.logger.debug(`[Plant] Navigating to ${farmlandPos}...`);
    const goal = new goals.GoalNear(farmlandPos.x, farmlandPos.y, farmlandPos.z, 2);
    await this.bot.pathfinder.goto(goal);

    this.bot.setQuickBarSlot(((this.bot.heldItem?.slot ?? 0) + 1) % 9);
    await sleep(10);

    if (this.bot.heldItem?.name !== seed.name) {
      await this.bot.equip(seed, 'hand');
      await sleep(10);
    }

    // Re-check after navigation
    const farmlandNow = this.bot.blockAt(farmlandPos);
    if (!farmlandNow || farmlandNow.name !== 'farmland') {
      this.bot.logger.debug(`[Plant] Farmland gone after navigation`);
      return;
    }

    const aboveNow = this.bot.blockAt(farmlandPos.offset(0, 1, 0));
    if (aboveNow && aboveNow.name !== 'air') {
      this.bot.logger.debug(`[Plant] Crop appeared after navigation`);
      return;
    }

    this.bot.logger.debug(`[Plant] Placing ${seedType} at ${farmlandPos}`);
    await this.bot.placeBlock(farmlandNow, new Vec3(0, 1, 0));

    const afterPlant = this.bot.blockAt(farmlandPos.offset(0, 1, 0));
    if (afterPlant && afterPlant.name !== 'air') {
      this.ctx!.planted = true;
      this.bot.logger.debug(`[Plant] Successfully planted ${seedType}`);
    }
  }
}
