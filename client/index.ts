import { VertexClient } from '..';

export * from './utils';

export * from './vertex-client';

export * from './helpers';

/**
 * Common helper arguments.
 */
export interface BaseArgs {
  readonly client: VertexClient;
  readonly verbose: boolean;
}

/**
 * Base paths for various Vertex environments.
 */
export type BasePath =
  | 'https://platform.platdev.vertexvis.io'
  | 'https://platform.platstaging.vertexvis.io'
  | 'https://platform.vertexvis.com'
  | string;

/**
 * Image rendering request arguments.
 */
export interface RenderRequest {
  readonly id: string;
  readonly height?: number;
  readonly width?: number;
}

/**
 * Polling configuration for async APIs.
 */
export interface Polling {
  readonly intervalMs: number;
  readonly maxAttempts: number;
}
