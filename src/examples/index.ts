export interface ExampleConfig {
  id: string;
  name: string;
  description: string;
  path: string;
}

export const examples: ExampleConfig[] = [
  {
    id: "pathfinder",
    name: "Pathfinder Viewer",
    description: "Simple bot with pathfinding and web viewer",
    path: "./pathfinder-viewer/main.ts"
  },
  {
    id: "farmer",
    name: "State Machine Farmer",
    description: "Autonomous farming bot using state machine pattern",
    path: "./state-machine-farmer/main.ts"
  }
];
