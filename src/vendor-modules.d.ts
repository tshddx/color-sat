declare module "apca-w3" {
  export function calcAPCA(text: string, background: string): number;
}

declare module "culori" {
  export function converter(mode: string): (value: unknown) => any;
  export function formatHex(value: unknown): string;
}
