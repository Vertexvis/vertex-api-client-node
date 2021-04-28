import { VertexClient } from './index';

export * from './utils';

export * from './vertex-client';

export * from './helpers/index';

/** Common helper arguments. */
export interface BaseReq {
  /** An instance of {@link VertexClient}. */
  readonly client: VertexClient;

  /** Callback to log progress. */
  readonly onMsg?: (msg: string) => void;

  /** Whether or not to include verbose log messages. */
  readonly verbose: boolean;
}

/** Base paths for various Vertex environments. */
export type BasePath =
  | 'https://platform.platdev.vertexvis.io'
  | 'https://platform.platstaging.vertexvis.io'
  | 'https://platform.vertexvis.com'
  | string;

/** Delete arguments. */
export interface DeleteReq extends BaseReq {
  /** The page size used while fetching listing. */
  readonly pageSize?: number;

  /** Set of IDs to *not* delete. */
  readonly exceptions?: Set<string>;
}

/** Polling configuration for async APIs. */
export interface Polling {
  /** How often to poll API in milliseconds. */
  readonly intervalMs: number;

  /** Maximum number of polling attempts. */
  readonly maxAttempts: number;
}

/**
 * Render image arguments. Render functions return Streams in Node. Here's an
 * example awaiting file creation,
 *
 * @example
 * ```typescript
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
export interface RenderImageReq extends BaseReq {
  /** A {@link RenderRequest}. */
  readonly renderReq: RenderReq;
}

/** Image rendering request arguments. */
export interface RenderReq {
  /** ID of resource. */
  readonly id: string;

  /** Height of resulting image. */
  readonly height?: number;

  /** Width of resulting image. */
  readonly width?: number;
}
