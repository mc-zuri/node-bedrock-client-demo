import { StateBehavior } from '@nxg-org/mineflayer-static-statemachine';
import mineflayerPathfinder from 'mineflayer-pathfinder';
const { goals } = mineflayerPathfinder;
import { Vec3 } from 'vec3';
import type { FarmingContext } from '../context.ts';
import { TREE_BLOCKS, LOG_TO_SAPLING, AXE_TYPES, LEAF_BLOCKS } from '../constants.ts';
import { hasTree, findTreeBase, getNeighborPositions, posToKey, sleep } from '../utils/index.ts';

const STATE_TIMEOUT = 30000; // 30 seconds

export class CutTreeState extends StateBehavior {
  name = 'cutTree';
  private done = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  get ctx(): FarmingContext | undefined {
    return this.bot.farmingContext;
  }

  isFinished(): boolean {
    return this.done;
  }

  hasTree(): boolean {
    return hasTree(this.bot);
  }

  async onStateEntered(): Promise<void> {
    this.done = false;
    this.bot.logger.debug('[CutTree] State entered');
    this.timeoutId = setTimeout(() => {
      this.bot.logger.debug('[CutTree] Timeout - forcing state exit');
      this.done = true;
    }, STATE_TIMEOUT);

    if (!this.ctx) {
      this.bot.logger.debug('[CutTree] No context, exiting');
      this.clearTimeout();
      this.done = true;
      return;
    }

    this.ctx.treeBasePosition = null;
    this.ctx.saplingType = null;

    try {
      this.bot.logger.debug('[CutTree] Finding tree base...');
      const baseLog = findTreeBase(this.bot);
      if (!baseLog) {
        this.bot.logger.debug('[CutTree] No reachable tree found');
        this.clearTimeout();
        this.done = true;
        return;
      }

      this.bot.logger.debug(`[CutTree] Found tree at ${baseLog.pos} (${baseLog.name})`);
      this.bot.chat(`Cutting ${baseLog.name.replace('_log', '')} tree`);

      this.ctx.treeBasePosition = baseLog.pos.clone();
      this.ctx.saplingType = LOG_TO_SAPLING[baseLog.name] || 'oak_sapling';

      await this.equipAxe();
      this.bot.logger.debug(`[CutTree] Navigating to ${baseLog.pos}...`);
      await this.navigateTo(baseLog.pos, 2);
      this.bot.logger.debug('[CutTree] Starting to cut blocks...');
      await this.cutConnectedBlocks(baseLog.pos);
    } catch (err) {
      this.bot.logger.error(`[CutTree] Error: ${err}`);
    } finally {
      this.clearTimeout();
      this.bot.logger.debug('[CutTree] State done');
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

  private async equipAxe(): Promise<void> {
    for (const axeType of AXE_TYPES) {
      const axe = this.bot.inventory.slots.find((s) => s?.name === axeType);
      if (axe) {
        await this.bot.equip(axe, 'hand');
        await sleep(100);
        break;
      }
    }
  }

  private async navigateTo(pos: Vec3, range: number): Promise<void> {
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.bot.pathfinder.goto(goal);
      } catch {
        // Path failed, try breaking leaves
      }

      // Check if we're close enough
      if (this.bot.entity.position.distanceTo(pos) <= range + 1) {
        return;
      }

      // Break leaves blocking the path
      const broken = await this.breakBlockingLeaves(pos);
      if (!broken) break;
    }
  }

  private async breakBlockingLeaves(targetPos: Vec3): Promise<boolean> {
    const botPos = this.bot.entity.position;
    const direction = targetPos.minus(botPos).normalize();
    // Perpendicular direction for checking sides (player width ~0.6)
    const perpX = -direction.z;
    const perpZ = direction.x;
    let broken = false;

    // Check blocks between bot and target at bot's height and head height
    for (let dist = 1; dist <= 4; dist++) {
      for (const yOffset of [0, 1]) {
        // Check center and both sides (for player width)
        for (const side of [0, -0.5, 0.5]) {
          const checkPos = new Vec3(
            Math.floor(botPos.x + direction.x * dist + perpX * side),
            Math.floor(botPos.y + yOffset),
            Math.floor(botPos.z + direction.z * dist + perpZ * side)
          );
          const block = this.bot.blockAt(checkPos);
          if (block && LEAF_BLOCKS.includes(block.name)) {
            try {
              await this.bot.dig(block);
              broken = true;
              await sleep(50);
            } catch {
              // Continue
            }
          }
        }
      }
    }

    return broken;
  }

  private async cutConnectedBlocks(startPos: Vec3): Promise<void> {
    const toCheck = [startPos.clone()];
    const cut = new Set<string>();

    while (toCheck.length > 0) {
      const pos = toCheck.shift()!;
      const key = posToKey(pos);

      if (cut.has(key)) continue;

      const block = this.bot.blockAt(pos);
      if (!block || !TREE_BLOCKS.includes(block.name)) continue;

      if (this.bot.entity.position.distanceTo(pos) > 4) {
        await this.navigateTo(pos, 2);
      }

      try {
        await this.bot.dig(block);
        cut.add(key);
      } catch (err) {
        console.log(`Failed to cut at ${pos}: ${err}`);
        continue;
      }

      for (const neighbor of getNeighborPositions(pos)) {
        if (!cut.has(posToKey(neighbor))) {
          const neighborBlock = this.bot.blockAt(neighbor);
          if (neighborBlock && TREE_BLOCKS.includes(neighborBlock.name)) {
            toCheck.push(neighbor);
          }
        }
      }

      await sleep(100);
    }

    console.log(`Cut ${cut.size} blocks`);
    this.bot.chat(`Cut ${cut.size} blocks`);
  }
}
