export * from './utils';
export * from './vertex-client';
export * from './helpers';

export type BasePath =
  | 'https://platform.platdev.vertexvis.io'
  | 'https://platform.platstaging.vertexvis.io'
  | 'https://platform.vertexvis.com'
  | string;

export interface RenderRequest {
  id: string;
  height?: number;
  width?: number;
}
