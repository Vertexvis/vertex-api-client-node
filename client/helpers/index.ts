import { RenderRequest, VertexClient } from '..';

export * from './files';

export * from './parts';

export * from './scenes';

export * from './scene-items';

export * from './scene-views';

/**
 * Render image arguments. Render functions return Streams in Node. Here's an
 * example awaiting file creation,
 *
 * @example
 * ```
 * async function main() {
 *   const imgStream = await renderScene<NodeJS.ReadableStream>(...);
 *   await createFile(imgStream.data, imgPath);
 * }
 *
 * async function createFile(
 *   stream: NodeJS.ReadableStream,
 *   path: string
 * ): Promise<void> {
 *   return new Promise((resolve) => {
 *     const ws = createWriteStream(path);
 *     stream.pipe(ws);
 *     ws.on('finish', resolve);
 *   });
 * }
 * ```
 *
 */
export interface RenderImageArgs {
  readonly client: VertexClient;
  readonly renderReq: RenderRequest;
}
