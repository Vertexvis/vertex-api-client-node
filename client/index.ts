import { VertexClient } from './index';

export * from './helpers/index';
export * from './utils';
export * from './vertex-client';

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

  /**
   * A map of polling attempt numbers to a delay in milliseconds.
   * Once the attempts are reach, the backoff will be added to `intervalMs`.
   */
  readonly backoff?: Record<number, number | undefined>;
}

/**
 * Render image arguments. Render functions return Streams. Here's an
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

export type ImageType = 'png' | 'jpg';

/** Image rendering request arguments. */
export interface RenderReq {
  /** ID of resource. */
  readonly id: string;

  /** Height of resulting image. */
  readonly height?: number;

  /** Type of resulting image. */
  readonly type?: ImageType;

  /** Width of resulting image. */
  readonly width?: number;
}
