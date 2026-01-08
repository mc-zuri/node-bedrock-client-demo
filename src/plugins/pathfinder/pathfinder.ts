import type { BedrockBot, BotOptions } from 'mineflayer';
import * as pathfinder from 'mineflayer-pathfinder';

export function pathFinderPlugin(bot: BedrockBot, options: BotOptions) {
  bot.once('spawn', () => {
    console.log('Bot spawned!');
    bot.loadPlugin(pathfinder.pathfinder);
    bot.pathfinder.setMovements(bot.defaultMovements);
  });
}
