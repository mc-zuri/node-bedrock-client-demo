import { StateBehavior } from '@nxg-org/mineflayer-static-statemachine';
import mineflayerPathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayerPathfinder;
import { Vec3 } from 'vec3';
import type { FarmingContext } from '../context.ts';
import { SEARCH_RADIUS, LOG_BLOCKS, SAPLING_BLOCKS, PLANTABLE_GROUND, MIN_TREE_SPACING, MIN_VERTICAL_SPACE, MAX_EXTRA_SAPLINGS_PER_CYCLE } from '../constants.ts';
import { FARM_BASE_X, FARM_BASE_Z, FARM_SIZE } from '../config.ts';
import { sleep } from '../utils/index.ts';

const STATE_TIMEOUT = 30000; // 30 seconds

export class PlantTreeState extends StateBehavior {
  name = 'plantTree';
  private done = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  get ctx(): FarmingContext | undefined {
    return this.bot.farmingContext;
  }

  isFinished(): boolean {
    return this.done;
  }

  async onStateEntered(): Promise<void> {
    this.done = false;
    this.bot.logger.debug('[PlantTree] State entered');
    this.timeoutId = setTimeout(() => {
      this.bot.logger.debug('[PlantTree] Timeout - forcing state exit');
      this.done = true;
    }, STATE_TIMEOUT);

    if (!this.ctx) {
      this.bot.logger.debug('[PlantTree] No context, exiting');
      this.clearTimeout();
      this.done = true;
      return;
    }

    try {
      if (this.ctx.treeBasePosition && this.ctx.saplingType) {
        this.bot.logger.debug(`[PlantTree] Planting ${this.ctx.saplingType} at tree base ${this.ctx.treeBasePosition}`);
        await this.plantSaplingAt(this.ctx.treeBasePosition, this.ctx.saplingType);
      }
      await this.plantExtraSaplings();
    } catch (err) {
      this.bot.logger.error(`[PlantTree] Error: ${err}`);
    } finally {
      this.clearTimeout();
      this.ctx.treeBasePosition = null;
      this.ctx.saplingType = null;
      this.bot.logger.debug('[PlantTree] State done');
      this.done = true;
    }
  }

  onStateExited(): void {
    this.clearTimeout();
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async plantSaplingAt(pos: Vec3, saplingType: string): Promise<boolean> {
    const sapling = this.bot.inventory.slots.find((s) => s?.name === saplingType);
    if (!sapling) return false;

    const groundPos = pos.offset(0, -1, 0);
    const ground = this.bot.blockAt(groundPos);
    if (!ground || !PLANTABLE_GROUND.includes(ground.name)) return false;

    await this.navigateTo(pos, 2);
    await this.bot.equip(sapling, 'hand');
    await sleep(100);
    await this.bot.placeBlock(ground, new Vec3(0, 1, 0));
    await sleep(500);
    console.log(`Planted ${saplingType} at ${pos}`);
    return true;
  }

  private async plantExtraSaplings(): Promise<void> {
    this.bot.logger.debug('[PlantTree] Looking for extra sapling spots');
    let planted = 0;

    while (planted < MAX_EXTRA_SAPLINGS_PER_CYCLE) {
      const sapling = this.bot.inventory.slots.find((s) => s && SAPLING_BLOCKS.includes(s.name));
      if (!sapling) {
        this.bot.logger.debug('[PlantTree] No saplings in inventory');
        break;
      }

      const validSpot = this.findValidPlantingSpot();
      if (!validSpot) {
        this.bot.logger.debug('[PlantTree] No valid planting spot found');
        break;
      }

      this.bot.logger.debug(`[PlantTree] Found spot at ${validSpot}, navigating...`);

      try {
        await this.navigateTo(validSpot, 2);

        if (!this.isValidPlantingSpot(validSpot)) {
          this.bot.logger.debug(`[PlantTree] Spot ${validSpot} invalid after navigation`);
          continue;
        }

        await this.bot.equip(sapling, 'hand');
        await sleep(100);

        const ground = this.bot.blockAt(validSpot);
        if (ground && PLANTABLE_GROUND.includes(ground.name)) {
          const plantPos = validSpot.offset(0, 1, 0);
          await this.bot.lookAt(plantPos, true);
          await this.bot.placeBlock(ground, new Vec3(0, 1, 0));
          await sleep(500);
          planted++;
          this.bot.logger.debug(`[PlantTree] Planted sapling at ${validSpot}`);
        }
      } catch (err) {
        this.bot.logger.debug(`[PlantTree] Failed at ${validSpot}: ${err}`);
      }
    }

    if (planted > 0) {
      console.log(`Planted ${planted} extra sapling(s)`);
      this.bot.chat(`Planted ${planted} extra sapling(s)`);
    }
  }

  private findValidPlantingSpot(): Vec3 | null {
    const groundBlocks = this.findGroundBlocks();
    for (const groundPos of groundBlocks) {
      if (this.isValidPlantingSpot(groundPos)) {
        return groundPos;
      }
    }
    return null;
  }

  private findGroundBlocks(): Vec3[] {
    const groundIds = new Set<number>();
    for (const name of PLANTABLE_GROUND) {
      const blockType = this.bot.registry.blocksByName[name];
      if (blockType) groundIds.add(blockType.id);
    }
    if (groundIds.size === 0) return [];

    // Only match surface blocks (plantable ground with air above)
    return this.bot.findBlocks({
      matching: [...groundIds],
      maxDistance: SEARCH_RADIUS,
      count: 64,
      useExtraInfo: (block) => {
        const { x, z } = block.position;
        // Avoid farm area + 4 block buffer
        const buffer = 4;
        if (
          x >= FARM_BASE_X - buffer &&
          x < FARM_BASE_X + FARM_SIZE + buffer &&
          z >= FARM_BASE_Z - buffer &&
          z < FARM_BASE_Z + FARM_SIZE + buffer
        ) {
          return false;
        }
        const above = this.bot.blockAt(block.position.offset(0, 1, 0));
        return above?.name === 'air';
      },
    });
  }

  private isValidPlantingSpot(groundPos: Vec3): boolean {
    const above = this.bot.blockAt(groundPos.offset(0, 1, 0));
    if (!above || above.name !== 'air') return false;

    for (let y = 1; y <= MIN_VERTICAL_SPACE; y++) {
      const block = this.bot.blockAt(groundPos.offset(0, y, 0));
      if (block && block.name !== 'air') return false;
    }

    for (const blockName of [...LOG_BLOCKS, ...SAPLING_BLOCKS]) {
      const blockType = this.bot.registry.blocksByName[blockName];
      if (!blockType) continue;
      const nearby = this.bot.findBlock({
        matching: blockType.id,
        maxDistance: MIN_TREE_SPACING,
        point: groundPos,
      });
      if (nearby) return false;
    }

    return true;
  }

  private async navigateTo(pos: Vec3, range: number): Promise<void> {
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
    await this.bot.pathfinder.goto(goal);
  }
}
