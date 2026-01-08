import { createBot, type BedrockBot } from "mineflayer";
import { pathFinderFollowPlugin } from "../../plugins/pathfinder/follow.ts";
import mineflayerPathfinder from "mineflayer-pathfinder";
import { viewerClickToMovePlugin } from "../../plugins/viewer-click-to-move.ts";
import pViewer from "prismarine-viewer";
import { startExternalServer, ensureBDSInstalled, loadSettings } from "../../shared/index.ts";
import path from "path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const settings = loadSettings();
const VERSION = settings.BDS_VERSION;
const BDS_PATH = settings.BDS_PATH;

const args = process.argv.slice(2);
const host = args[0] || "127.0.0.1";
const port = parseInt(args[1]) || 19134; // 19132-19133 reserved for LAN discovery

async function main(): Promise<void> {
  console.log("Starting Pathfinder Viewer...");

  await ensureBDSInstalled(VERSION, BDS_PATH);
  const server = await startExternalServer({
    port,
    bdsPath: path.normalize(BDS_PATH),
    worldName: "pathfinder-viewer",
    gamemode: "creative",
  });

  console.log("\n========================================");
  console.log("  CONNECTION DETAILS");
  console.log("========================================");
  console.log(`  Host: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  BDS:  ${BDS_PATH}`);
  console.log("========================================");
  console.log("  Waiting 10 seconds before bot connects...");
  console.log("========================================\n");
  await sleep(10000);

  const bot = createBot({
    host,
    port,
    auth: "offline",
    username: "BedrockBot",
    version: `bedrock_${VERSION}`,
  }) as BedrockBot;

  bot.once("inject_allowed", () => {
    bot.loadPlugin(mineflayerPathfinder.pathfinder);
    bot.defaultMovements = new mineflayerPathfinder.Movements(bot);
    bot.defaultMovements.canDig = false;
    bot.defaultMovements.canOpenDoors = false;
    bot.defaultMovements.allowSprinting = true;
    bot.defaultMovements.allowParkour = true;
    bot.defaultMovements.allowFreeMotion = true;

    console.log("loading pathFinder - follow plugin");
    bot.loadPlugin(pathFinderFollowPlugin);

    bot.pathfinder.setMovements(bot.defaultMovements);
  });

  bot.on("error", (err) => console.error("Bot error:", err));
  bot.once("end", () => console.log("Bot disconnected."));

  bot.once("spawn", () => {
    console.log("Bot spawned!");

    console.log("loading viewer plugin");
    pViewer.bedrockMineflayer(bot, { firstPerson: false, javaVersion: "1.21.11", port: 3000, viewDistance: 5 });

    console.log("loading viewer - click to move plugin");
    bot.loadPlugin(viewerClickToMovePlugin);
  });

}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
