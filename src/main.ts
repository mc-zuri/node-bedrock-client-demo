import { select, input } from "@inquirer/prompts";
import { examples } from "./examples/index.ts";
import { loadSettings, saveSettings } from "./shared/settings.ts";

const arg = process.argv[2];

async function showSettings(): Promise<void> {
  const settings = loadSettings();

  console.log("\n========================================");
  console.log("  CURRENT SETTINGS");
  console.log("========================================");
  console.log(`  BDS Path:    ${settings.BDS_PATH}`);
  console.log(`  BDS Version: ${settings.BDS_VERSION}`);
  console.log("========================================\n");

  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Change BDS Path", value: "path" },
      { name: "Change BDS Version", value: "version" },
      { name: "Back to main menu", value: "back" },
    ],
  });

  if (action === "path") {
    const newPath = await input({
      message: "Enter new BDS path:",
      default: settings.BDS_PATH,
    });
    saveSettings({ BDS_PATH: newPath });
    console.log(`\nBDS path updated to: ${newPath}\n`);
    await showSettings();
  } else if (action === "version") {
    const newVersion = await input({
      message: "Enter BDS version:",
      default: settings.BDS_VERSION,
    });
    saveSettings({ BDS_VERSION: newVersion });
    console.log(`\nBDS version updated to: ${newVersion}\n`);
    await showSettings();
  }
}

async function main() {
  let selectedId = arg;

  const validExample = examples.find(e => e.id === selectedId);

  if (!selectedId || !validExample) {
    if (selectedId && !validExample && selectedId !== "settings") {
      console.log(`Unknown example: "${selectedId}"\n`);
    }

    const settings = loadSettings();
    console.log(`\nBDS: ${settings.BDS_PATH} (v${settings.BDS_VERSION})\n`);

    selectedId = await select({
      message: "Select an option:",
      choices: [
        ...examples.map(e => ({
          name: `${e.name} - ${e.description}`,
          value: e.id
        })),
        { name: "Settings - Configure BDS path and version", value: "settings" },
      ],
    });
  }

  if (selectedId === "settings") {
    await showSettings();
    return main();
  }

  const example = examples.find(e => e.id === selectedId)!;
  console.log(`\nRunning: ${example.name}\n`);

  const examplePath = new URL(`./examples/${example.path.replace("./", "")}`, import.meta.url).href;
  await import(examplePath);
}

main().catch(console.error);
