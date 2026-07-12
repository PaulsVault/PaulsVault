declare module "@3d-dice/dice-box-threejs" {
  // Motor 3D basado en ThreeJS. La clase inicializa con initialize() y acepta
  // notación "1d20@15" para forzar el resultado (la app manda la cara, la física anima).
  const DiceBox: new (selector: string, config?: Record<string, unknown>) => {
    initialize: () => Promise<unknown>;
    roll: (notation: string) => Promise<unknown>;
    reroll: (ids: number[]) => Promise<unknown>;
    clearDice: () => void;
    updateConfig: (config: Record<string, unknown>) => Promise<unknown>;
    onRollComplete?: (results: unknown) => void;
    strength: number;
    initialized: boolean;
  };
  export default DiceBox;
}
