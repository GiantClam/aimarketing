export function toUint8Array(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }

  return new Uint8Array(input)
}

export function toBase64(input: ArrayBuffer | ArrayBufferView): string {
  return Buffer.from(toUint8Array(input)).toString("base64")
}

export function byteLengthOf(input: ArrayBuffer | ArrayBufferView): number {
  return toUint8Array(input).byteLength
}
