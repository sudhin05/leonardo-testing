declare module "heic-convert" {
  const convert: (o: { buffer: Buffer | Uint8Array; format: "PNG" | "JPEG"; quality?: number }) => Promise<ArrayBuffer>;
  export default convert;
}
