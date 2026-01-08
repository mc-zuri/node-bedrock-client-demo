import { StateBehavior } from '@nxg-org/mineflayer-static-statemachine';
import type { FarmingContext } from '../context.ts';
import { needsDeposit, hasTree, findMatureCrop, findEmptyFarmland } from '../utils/index.ts';
import { SEED_TYPES } from '../constants.ts';

export class IdleState extends StateBehavior {
  name = 'idle';
  private done = false;
  private waitTimeout: ReturnType<typeof setTimeout> | null = null;

  get ctx(): FarmingContext | undefined {
    return this.bot.farmingContext;
  }

  isFinished(): boolean {
    return this.done;
  }

  needsDeposit(): boolean {
    return needsDeposit(this.bot);
  }

  hasTree(): boolean {
    return hasTree(this.bot);
  }

  hasMatureCrops(): boolean {
    return findMatureCrop(this.bot) !== null;
  }

  hasEmptyFarmland(): boolean {
    // Check if we have any seeds first
    const hasSeeds = SEED_TYPES.some((seed) => {
      const itemType = this.bot.registry.itemsByName[seed];
      return itemType && this.bot.inventory.count(itemType.id, null) > 0;
    });
    if (!hasSeeds) return false;

    const pos = findEmptyFarmland(this.bot);
    if (pos && this.ctx) {
      this.ctx.foundFarmland = pos;
      this.ctx.seedForReplant = null;
    }
    return pos !== null;
  }

  async onStateEntered(): Promise<void> {
    this.done = false;
    this.bot.logger.debug('[Idle] State entered, checking conditions...');

    const deposit = this.needsDeposit();
    const tree = this.hasTree();
    const crops = this.hasMatureCrops();
    const farmland = this.hasEmptyFarmland();

    this.bot.logger.debug(`[Idle] deposit=${deposit}, tree=${tree}, crops=${crops}, farmland=${farmland}`);

    if (deposit || tree || crops || farmland) {
      this.done = true;
    } else {
      this.bot.logger.debug('[Idle] Nothing to do, waiting 500ms...');
      this.waitTimeout = setTimeout(() => {
        this.done = true;
      }, 500);
    }
  }

  onStateExited(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
  }
}

export * from './harvest.ts';
export * from './plant.ts';
export * from './deposit.ts';
export * from './cut-tree.ts';
export * from './plant-tree.ts';
