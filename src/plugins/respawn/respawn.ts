import type { BedrockBot, BotOptions,  } from 'mineflayer';
import { once, sleep } from 'mineflayer/lib/promise_utils.js';

export function pathFinderFollowPlugin(bot: BedrockBot, options: BotOptions) {
bot._client.on('entity_event', async (data: any) => {
  if (data.event_id == 'death_animation' && data.runtime_entity_id == bot.entity.id) {
    console.log('death_animation event received!');
    await sleep(200);

    bot._client.write('respawn', {
      position: { x: 0, y: 0, z: 0 },
      state: 2,
      runtime_entity_id: bot.entity.id,
    });

    console.log('waiting for respawn event...');
    await once(bot._client, 'respawn', (data: any) => data.state === 1);
    await sleep(200);
    console.log('respawn event received!');

    bot._client.write('player_action', {
      runtime_entity_id: bot.entity.id,
      action: 'respawn',
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: -1,
    });
  }
});
}
