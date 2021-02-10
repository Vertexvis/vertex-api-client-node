import { AxiosResponse } from 'axios';
import { RenderImageArgs } from '../index';

/**
 * Render a scene view.
 *
 * @param args - The {@link RenderImageArgs}.
 */
export async function renderSceneView<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageArgs): Promise<AxiosResponse<T>> {
  return await client.sceneViews.renderSceneView(
    { id, height, width },
    { responseType: 'stream' }
  );
}
