declare module 'blakejs' {
  export interface Blake2bOptions {
    key?: Uint8Array | null
  }

  export function blake2b(input: Uint8Array, key?: Uint8Array | null, outlen?: number): Uint8Array
  export function blake2bHex(input: Uint8Array, key?: Uint8Array | null, outlen?: number): string
  export function blake2s(input: Uint8Array, key?: Uint8Array | null, outlen?: number): Uint8Array
  export function blake2sHex(input: Uint8Array, key?: Uint8Array | null, outlen?: number): string
}