import { AxiosResponse } from 'axios';
import { RenderImageReq, toAccept, tryStream } from '../index';

/**
 * Render a scene view.
 *
 * @param args - The {@link RenderImageReq}.
 */
export function renderSceneView<T>({
  client,
  renderReq: { id, height, type = 'png', width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(() =>
    client.sceneViews.renderSceneView(
      { id, height, width },
      { headers: { accept: toAccept(type) }, responseType: 'stream' }
    )
  );
}
