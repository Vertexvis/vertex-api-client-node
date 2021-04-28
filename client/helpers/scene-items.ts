import { CreateSceneItemRequest, SceneItem } from '../../index';
import {
  BaseReq,
  isPollError,
  MaxAttempts,
  Polling,
  PollIntervalMs,
  pollQueuedJob,
  throwOnError,
} from '../index';

/**
 * Create scene item arguments.
 */
export interface CreateSceneItemReq extends BaseReq {
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
 * @param args - The {@link CreateSceneItemReq}.
 */
export async function createSceneItem({
  client,
  createSceneItemReq,
  onMsg = console.log,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  sceneId,
  verbose,
}: CreateSceneItemReq): Promise<SceneItem> {
  const res = await client.sceneItems.createSceneItem({
    id: sceneId,
    createSceneItemRequest: createSceneItemReq(),
  });
  const queuedId = res.data.data.id;
  if (verbose) onMsg(`Created scene-item with queued-scene-item ${queuedId}`);

  const pollRes = await pollQueuedJob<SceneItem>({
    id: queuedId,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    polling,
  });
  if (isPollError(pollRes.res)) {
    throwOnError({ maxAttempts: polling.maxAttempts, pollRes });
  }

  if (verbose) onMsg(`Created scene-item ${pollRes.res.data.id}`);

  return pollRes.res;
}
