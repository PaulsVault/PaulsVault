declare module "@3d-dice/dice-box" {
  const DiceBox: new (selector: string, config?: Record<string, unknown>) => {
    init: () => Promise<unknown>;
    roll: (notation: unknown) => Promise<unknown>;
    clear: () => void;
    updateConfig?: (config: Record<string, unknown>) => void;
    onRollComplete?: (results: unknown) => void;
  };
  export default DiceBox;
}
