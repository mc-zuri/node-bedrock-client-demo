import { startExternalServer, ensureBDSInstalled } from '../../shared/external-server.ts';
import { VERSION, BDS_PATH } from './config.ts';
import { fileURLToPath } from 'url';
import { setupFarm } from './setup.ts';
import { createFarmingBot, startStateMachine } from './bot-setup.ts';
import path from 'path';
import pViewer from "prismarine-viewer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const host = args[0] || '127.0.0.1';
const port = parseInt(args[1]) || 19134; // 19132-19133 reserved for LAN discovery

async function main(): Promise<void> {
  console.log('Starting State Machine Farmer...');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const templateWorldPath = path.resolve(__dirname, '..', '..', '..', 'worlds', 'state-machine-farmer');

  await ensureBDSInstalled(VERSION, BDS_PATH);
  const server = await startExternalServer({
    port,
    bdsPath: path.normalize(BDS_PATH),
    worldName: 'state-machine-farmer',
    templateWorldPath,
  });

  // Print connection details and wait for user to connect
  console.log('\n========================================');
  console.log('  CONNECTION DETAILS');
  console.log('========================================');
  console.log(`  Host: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  BDS:  ${BDS_PATH}`);
  console.log('========================================');
  console.log('  Waiting 10 seconds before bot connects...');
  console.log('========================================\n');
  await sleep(10000);

  const bot = createFarmingBot({ host, port, version: VERSION });

  bot.on('error', (err) => console.error('Bot error:', err));
  bot.on('end', () => console.log('Bot disconnected'));

  bot.once('spawn', async () => {
    console.log('Bot spawned!');
    await bot.waitForChunksToLoad();

     pViewer.bedrockMineflayer(bot, {firstPerson: false, javaVersion: '1.21.11', port: 3000, viewDistance:5})

    await setupFarm(server, bot.username);
    startStateMachine(bot);    
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
