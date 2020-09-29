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
