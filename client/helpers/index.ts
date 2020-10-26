import { RenderRequest, VertexClient } from '..';

export * from './files';
export * from './parts';
export * from './scenes';
export * from './scene-items';
export * from './scene-views';

export interface RenderImageArgs {
  client: VertexClient;
  renderReq: RenderRequest;
}
