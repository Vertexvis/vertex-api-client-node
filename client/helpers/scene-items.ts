import { CreateSceneItemRequest, SceneItem } from '../..';
import { pollQueuedJob, VertexClient } from '..';

interface CreateSceneItemArgs {
  client: VertexClient;
  verbose: boolean;
  sceneId: string;
  createSceneItemReq: () => CreateSceneItemRequest;
}

export async function createSceneItem(
  args: CreateSceneItemArgs
): Promise<SceneItem> {
  const res = await args.client.sceneItems.createSceneItem(
    args.sceneId,
    args.createSceneItemReq()
  );
  const queuedId = res.data.data.id;
  if (args.verbose)
    console.log(`Created scene-item with queued-scene-item ${queuedId}`);

  const sceneItem = await pollQueuedJob<SceneItem>(queuedId, (id) =>
    args.client.sceneItems.getQueuedSceneItem(id)
  );
  if (args.verbose) console.log(`Created scene-item ${sceneItem.data.id}`);

  return sceneItem;
}
