import mineflayer, { type Bot, type BotOptions } from 'mineflayer';
import { type ExternalServer, type ExternalServerOptions, startExternalServer } from './external-server.ts';

/**
 * Run a test function with a managed external server instance.
 * Server is automatically started before and stopped after the test.
 */
export async function withExternalServer(testFn: (server: ExternalServer) => Promise<void>, options?: ExternalServerOptions): Promise<void> {
  const server = await startExternalServer(options);
  try {
    await testFn(server);
  } finally {
    await server.stop();
  }
}

/**
 * Connect a mineflayer bot to the external server.
 */
export async function connectBotToExternalServer(server: ExternalServer, botOptions?: Partial<BotOptions>): Promise<Bot> {
  const bot = mineflayer.createBot({
    host: server.host,
    port: server.port,
    version: `bedrock_${server.version}`,
    auth: 'offline',
    username: botOptions?.username ?? 'TestBot',
    offline: true,
    conLog: () => {},
    ...botOptions,
  });

  return bot;
}

/**
 * Wait for the bot to spawn in the world.
 */
export async function waitForBotSpawn(bot: Bot, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for bot to spawn'));
    }, timeout);

    bot.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });

    bot.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    bot.once('kicked', (reason) => {
      clearTimeout(timer);
      reject(new Error(`Bot was kicked: ${reason}`));
    });
  });
}

/**
 * Wait for a condition to become true.
 */
export async function waitFor(condition: () => boolean, timeout = 10000, interval = 100): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(interval);
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Server Commands - Use these to set up test scenarios
// ============================================================================

/**
 * Give an item to a player.
 */
export async function giveItem(server: ExternalServer, player: string, item: string, count = 1): Promise<void> {
  await server.sendCommand(`give ${player} ${item} ${count}`);
}

/**
 * Clear a player's inventory.
 */
export async function clearInventory(server: ExternalServer, player: string): Promise<void> {
  await server.sendCommand(`clear ${player}`);
}

/**
 * Teleport a player to a location.
 */
export async function teleportPlayer(server: ExternalServer, player: string, x: number, y: number, z: number): Promise<void> {
  await server.sendCommand(`tp ${player} ${x} ${y} ${z}`);
  await sleep(100);
}

/**
 * Teleport a player and wait for the bot to receive the position update.
 */
export async function teleportPlayerAndSync(
  server: ExternalServer,
  bot: Bot,
  x: number,
  y: number,
  z: number,
  timeout = 5000
): Promise<void> {
  const positionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for position sync after teleport'));
    }, timeout);

    const onForcedMove = () => {
      clearTimeout(timer);
      resolve();
    };
    bot.once('forcedMove', onForcedMove);
  });

  await server.sendCommand(`tp ${bot.username} ${x} ${y} ${z}`);
  await positionPromise;
  await sleep(50);
}

/**
 * Set a player's game mode.
 */
export async function setGamemode(server: ExternalServer, player: string, mode: 'survival' | 'creative' | 'adventure' | 'spectator'): Promise<void> {
  await server.sendCommand(`gamemode ${mode} ${player}`);
  await sleep(100);
}

/**
 * Set a block at a specific location.
 */
export async function setBlock(server: ExternalServer, x: number, y: number, z: number, block: string): Promise<void> {
  await server.sendCommand(`setblock ${x} ${y} ${z} ${block}`);
  await sleep(100);
}

/**
 * Fill a region with a block.
 */
export async function fill(server: ExternalServer, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): Promise<void> {
  await server.sendCommand(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`);
  await sleep(100);
}

/**
 * Kill all entities of a type.
 */
export async function killEntities(server: ExternalServer, entityType: string): Promise<void> {
  await server.sendCommand(`kill @e[type=${entityType}]`);
  await sleep(100);
}
