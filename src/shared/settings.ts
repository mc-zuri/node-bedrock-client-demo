import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");

export interface Settings {
  BDS_PATH: string;
  BDS_VERSION: string;
}

const DEFAULT_SETTINGS: Settings = {
  BDS_PATH: path.join(PROJECT_ROOT, "bedrock-server"),
  BDS_VERSION: "1.21.130",
};

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };

  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key in settings) {
        (settings as any)[key] = value;
      }
    }
  }

  // Also check process.env (takes precedence)
  if (process.env.BDS_PATH) settings.BDS_PATH = process.env.BDS_PATH;
  if (process.env.BDS_VERSION) settings.BDS_VERSION = process.env.BDS_VERSION;

  return settings;
}

export function saveSettings(settings: Partial<Settings>): void {
  const current = loadSettings();
  const merged = { ...current, ...settings };

  const lines: string[] = [
    "# Bedrock Demo Settings",
    `BDS_PATH="${merged.BDS_PATH}"`,
    `BDS_VERSION="${merged.BDS_VERSION}"`,
  ];

  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n");
}

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
