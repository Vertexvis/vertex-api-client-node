import { AxiosResponse } from 'axios';
import { RenderImageArgs, tryStream } from '../index';

/**
 * Render a scene view.
 *
 * @param args - The {@link RenderImageArgs}.
 */
export async function renderSceneView<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageArgs): Promise<AxiosResponse<T>> {
  return tryStream(async () =>
    client.sceneViews.renderSceneView(
      { id, height, width },
      { responseType: 'stream' }
    )
  );
}
