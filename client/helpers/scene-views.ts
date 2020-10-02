import { AxiosResponse } from 'axios';
import { RenderImageArgs } from '.';

// Returns Stream in Node, `(await renderSceneView(...)).data.pipe(createWriteStream('image.jpeg'))`
export const renderSceneView = async (
  args: RenderImageArgs
): Promise<AxiosResponse<any>> =>
  (
    await args.client.sceneViews.renderSceneView(
      args.renderReq.id,
      args.renderReq.height,
      args.renderReq.width,
      { responseType: 'stream' }
    )
  ).data;
