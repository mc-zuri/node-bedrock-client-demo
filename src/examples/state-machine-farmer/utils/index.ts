import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';
import { SEARCH_RADIUS, DEPOSIT_THRESHOLD, HARVEST_ITEMS, CROP_BLOCKS, LOG_BLOCKS, TREE_BLOCKS, MAX_CROP_GROWTH, PLANTABLE_GROUND } from '../constants.ts';

// Blocks that can be under a tree base (ground blocks)
const GROUND_BLOCKS = [...PLANTABLE_GROUND, 'stone', 'cobblestone', 'sand', 'gravel', 'clay', 'mycelium', 'farmland'];

const MAX_REACH_HEIGHT = 4; // Max blocks above ground the bot can reach

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function needsDeposit(bot: Bot): boolean {
  const allItems = bot.inventory.itemsRange(0, 36);
  for (const itemName of HARVEST_ITEMS) {
    let count = 0;
    for (const item of allItems) {
      if (item?.name === itemName) count += item.count;
    }
    if (count >= DEPOSIT_THRESHOLD) return true;
  }
  return false;
}

export function hasTree(bot: Bot): boolean {
  return findTreeBase(bot) !== null;
}

export function findMatureCrop(bot: Bot): Vec3 | null {
  for (const cropName of CROP_BLOCKS) {
    const blockType = bot.registry.blocksByName[cropName];
    if (!blockType) continue;

    const found = bot.findBlocks({
      matching: blockType.id,
      maxDistance: SEARCH_RADIUS,
      count: 1,
    });

    for (const pos of found) {
      const block = bot.blockAt(pos);
      // @ts-ignore - Bedrock specific property
      if (block && block._properties?.growth === MAX_CROP_GROWTH) {
        return pos;
      }
    }
  }
  return null;
}

export function findEmptyFarmland(bot: Bot): Vec3 | null {
  const farmlandType = bot.registry.blocksByName['farmland'];
  if (!farmlandType) return null;

  const found = bot.findBlocks({
    matching: farmlandType.id,
    maxDistance: SEARCH_RADIUS,
    count: 64,
  });

  for (const pos of found) {
    const blockAbove = bot.blockAt(pos.offset(0, 1, 0));
    if (blockAbove && blockAbove.name === 'air') {
      return pos;
    }
  }
  return null;
}

interface TreeBase {
  pos: Vec3;
  name: string;
}

export function findTreeBase(bot: Bot): TreeBase | null {
  const candidates: TreeBase[] = [];

  for (const logName of LOG_BLOCKS) {
    const blockType = bot.registry.blocksByName[logName];
    if (!blockType) continue;

    const found = bot.findBlocks({
      matching: blockType.id,
      maxDistance: SEARCH_RADIUS,
      count: 64,
    });

    for (const pos of found) {
      // Check if this is a base log (has solid ground below, not air/leaves/another log)
      const below = bot.blockAt(pos.offset(0, -1, 0));
      if (below && GROUND_BLOCKS.includes(below.name)) {
        candidates.push({ pos, name: logName });
      }
    }
  }

  // Sort by lowest Y first (most likely to be actual base), then by distance
  const botPos = bot.entity.position;
  candidates.sort((a, b) => {
    if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y;
    return a.pos.distanceTo(botPos) - b.pos.distanceTo(botPos);
  });

  // Find first reachable tree (check height and raycast visibility)
  for (const candidate of candidates) {
    const maxHeight = getTreeHeight(bot, candidate.pos);
    if (maxHeight > MAX_REACH_HEIGHT) continue;

    // Raycast from bot eye position to tree to check if path is clear
    const eyePos = botPos.offset(0, 1.62, 0); // Player eye height
    const direction = candidate.pos.minus(eyePos).normalize();
    const distance = eyePos.distanceTo(candidate.pos);

    const hit = bot.world.raycast(eyePos, direction, distance, (block) => {
      // Stop at solid blocks that aren't tree blocks
      return block.boundingBox === 'block' && !TREE_BLOCKS.includes(block.name);
    });

    // If no blocking hit, or hit is the tree itself, it's reachable
    if (!hit || hit.position.distanceTo(candidate.pos) < 2) {
      return candidate;
    }
  }

  return null;
}

function getTreeHeight(bot: Bot, basePos: Vec3): number {
  const visited = new Set<string>();
  const toCheck = [basePos.clone()];
  let maxY = basePos.y;

  while (toCheck.length > 0) {
    const pos = toCheck.shift()!;
    const key = posToKey(pos);

    if (visited.has(key)) continue;
    visited.add(key);

    const block = bot.blockAt(pos);
    if (!block || !TREE_BLOCKS.includes(block.name)) continue;

    if (pos.y > maxY) maxY = pos.y;

    // Only check upward and horizontal neighbors (tree grows up)
    for (const neighbor of getNeighborPositions(pos)) {
      if (!visited.has(posToKey(neighbor))) {
        toCheck.push(neighbor);
      }
    }
  }

  return maxY - basePos.y;
}

export function getNeighborPositions(pos: Vec3): Vec3[] {
  return [
    pos.offset(0, 1, 0),
    pos.offset(0, -1, 0),
    pos.offset(1, 0, 0),
    pos.offset(-1, 0, 0),
    pos.offset(0, 0, 1),
    pos.offset(0, 0, -1),
    pos.offset(1, 0, 1),
    pos.offset(1, 0, -1),
    pos.offset(-1, 0, 1),
    pos.offset(-1, 0, -1),
    pos.offset(1, 1, 0),
    pos.offset(-1, 1, 0),
    pos.offset(0, 1, 1),
    pos.offset(0, 1, -1),
    pos.offset(1, 1, 1),
    pos.offset(1, 1, -1),
    pos.offset(-1, 1, 1),
    pos.offset(-1, 1, -1),
  ];
}

export function posToKey(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`;
}
