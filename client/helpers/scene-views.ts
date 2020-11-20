import { AxiosResponse } from 'axios';
import { RenderImageArgs } from '../..';

export async function renderSceneView<T>(
  args: RenderImageArgs
): Promise<AxiosResponse<T>> {
  return await args.client.sceneViews.renderSceneView(
    {
      id: args.renderReq.id,
      height: args.renderReq.height,
      width: args.renderReq.width,
    },
    { responseType: 'stream' }
  );
}
