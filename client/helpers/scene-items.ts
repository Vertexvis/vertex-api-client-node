import { CreateSceneItemRequest, SceneItem } from '../..';
import { Polling, pollQueuedJob, VertexClient } from '..';

/**
 * Create scene item arguments.
 */
interface CreateSceneItemArgs {
  readonly client: VertexClient;
  readonly verbose: boolean;
  readonly sceneId: string;
  readonly createSceneItemReq: () => CreateSceneItemRequest;
  readonly polling: Polling;
}

/**
 * Create a scene item.
 *
 * @param args - The {@link CreateSceneItemArgs}.
 */
export async function createSceneItem(
  args: CreateSceneItemArgs
): Promise<SceneItem> {
  const res = await args.client.sceneItems.createSceneItem({
    id: args.sceneId,
    createSceneItemRequest: args.createSceneItemReq(),
  });
  const queuedId = res.data.data.id;
  if (args.verbose)
    console.log(`Created scene-item with queued-scene-item ${queuedId}`);

  const sceneItem = await pollQueuedJob<SceneItem>({
    id: queuedId,
    getQueuedJob: (id) => args.client.sceneItems.getQueuedSceneItem({ id }),
    polling: args.polling,
  });
  if (args.verbose) console.log(`Created scene-item ${sceneItem.data.id}`);

  return sceneItem;
}
