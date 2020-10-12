import { Matrix4, ColorMaterial } from '..';

export * from './utils';
export * from './vertex-client';
export * from './helpers';

export interface SceneTemplateItem {
  materialOverride?: ColorMaterial;
  name?: string;
  parentId?: string;
  source?: string;
  suppliedId: string;
  transform?: Matrix4;
}

export type BasePath =
  | 'https://platform.platdev.vertexvis.io'
  | 'https://platform.platstaging.vertexvis.io'
  | 'https://platform.platprod.vertexvis.io'
  | string;

export interface RenderRequest {
  id: string;
  height?: number;
  width?: number;
}
