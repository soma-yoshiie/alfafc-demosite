// gifenc には型定義が同梱されていないための最小限の型宣言（詳細は any で許容）。
declare module "gifenc" {
  export interface GIFEncoderOptions {
    initialCapacity?: number;
    auto?: boolean;
  }

  export interface WriteFrameOptions {
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    palette?: number[][] | null;
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: WriteFrameOptions
    ): void;
  }

  export function GIFEncoder(opt?: GIFEncoderOptions): GIFEncoderInstance;
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: any): number[][];
  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: any
  ): Uint8Array;
  export function prequantize(data: Uint8Array | Uint8ClampedArray, opts?: any): void;
  export function nearestColorIndex(palette: number[][], color: number[], format?: any): number;
  export function nearestColor(palette: number[][], color: number[], format?: any): number[];
  export function nearestColorIndexWithDistance(
    palette: number[][],
    color: number[],
    format?: any
  ): [number, number];
  export function snapColorsToPalette(palette: number[][], knownColors: number[][], threshold?: number): void;

  export default GIFEncoder;
}
