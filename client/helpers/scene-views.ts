import { AxiosResponse } from 'axios';
import { RenderImageReq, tryStream } from '../index';

/**
 * Render a scene view.
 *
 * @param args - The {@link RenderImageReq}.
 */
export async function renderSceneView<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(async () =>
    client.sceneViews.renderSceneView(
      { id, height, width },
      { responseType: 'stream' }
    )
  );
}
