import { CreateSceneItemRequest, SceneItem } from '../../index';
import { BaseArgs, Polling, pollQueuedJob } from '../index';

/**
 * Create scene item arguments.
 */
interface CreateSceneItemArgs extends BaseArgs {
  /** Function returning a {@link CreateSceneItemRequest}. */
  readonly createSceneItemReq: () => CreateSceneItemRequest;

  /** ID of scene to add scene items to. */
  readonly sceneId: string;

  /** {@link Polling} */
  readonly polling: Polling;
}

/**
 * Create a scene item.
 *
 * @param args - The {@link CreateSceneItemArgs}.
 */
export async function createSceneItem({
  client,
  createSceneItemReq,
  polling,
  sceneId,
  verbose,
}: CreateSceneItemArgs): Promise<SceneItem> {
  const res = await client.sceneItems.createSceneItem({
    id: sceneId,
    createSceneItemRequest: createSceneItemReq(),
  });
  const queuedId = res.data.data.id;
  if (verbose)
    console.log(`Created scene-item with queued-scene-item ${queuedId}`);

  const sceneItem = await pollQueuedJob<SceneItem>({
    id: queuedId,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    polling,
  });
  if (verbose) console.log(`Created scene-item ${sceneItem.data.id}`);

  return sceneItem;
}
