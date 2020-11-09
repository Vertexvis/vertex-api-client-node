import { AxiosResponse } from 'axios';
import { RenderImageArgs } from '../..';

// Returns Stream in Node, `(await renderSceneView(...)).data.pipe(createWriteStream('image.jpeg'))`
export const renderSceneView = async (
  args: RenderImageArgs
): Promise<AxiosResponse<any>> =>
  (
    await args.client.sceneViews.renderSceneView(
      {
        id: args.renderReq.id,
        height: args.renderReq.height,
        width: args.renderReq.width,
      },
      { responseType: 'stream' }
    )
  ).data;
