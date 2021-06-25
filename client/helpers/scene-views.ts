import { AxiosResponse } from 'axios';
import { RenderImageReq, tryStream } from '../index';

/**
 * Render a scene view.
 *
 * @param args - The {@link RenderImageReq}.
 */
export function renderSceneView<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(() =>
    client.sceneViews.renderSceneView(
      { id, height, width },
      { headers: { accept: 'image/png' }, responseType: 'stream' }
    )
  );
}
