declare module "d3-contour" {
  export interface ContourMultiPolygon {
    type: "MultiPolygon";
    value: number;
    coordinates: number[][][][];
  }
  export function contours(): {
    size(size: [number, number]): ReturnType<typeof contours>;
    thresholds(thresholds: number[]): ReturnType<typeof contours>;
    (values: number[]): ContourMultiPolygon[];
  };
}

declare module "d3-array" {
  export function min<T>(array: ArrayLike<T>): T | undefined;
  export function max<T>(array: ArrayLike<T>): T | undefined;
}
