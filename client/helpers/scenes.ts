import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import {
  CameraFitTypeEnum,
  CreateSceneItemRequest,
  CreateSceneRequest,
  QueuedJob,
  Scene,
  SceneData,
  SceneItem,
  SceneRelationshipDataTypeEnum,
  UpdateSceneRequestDataAttributesStateEnum,
} from '../../index';
import {
  BaseArgs,
  DeleteArgs,
  getPage,
  MaxAttempts,
  Polling,
  PollIntervalMs,
  pollQueuedJob,
  RenderImageArgs,
} from '../index';

/**
 * Create scene with scene items arguments.
 */
export interface CreateSceneWithSceneItemsArgs extends BaseArgs {
  /** A list of {@link CreateSceneItemRequest}. */
  readonly createSceneItemReqs: CreateSceneItemRequest[];

  /** Function returning a {@link CreateSceneRequest}. */
  readonly createSceneReq: () => CreateSceneRequest;

  /** How many requests to run in parallel. */
  readonly parallelism: number;

  /** {@link Polling} */
  readonly polling?: Polling;

  /** Callback with total number of requests and number complete. */
  onProgress?: (complete: number, total: number) => void;
}

/**
 * Poll scene ready arguments.
 */
export interface PollSceneReadyArgs extends BaseArgs {
  /** ID of scene. */
  readonly id: string;

  /** {@link Polling} */
  readonly polling?: Polling;
}

/**
 * Create a scene with scene items.
 *
 * @param args - The {@link CreateSceneWithSceneItemsArgs}.
 */
export async function createSceneWithSceneItems({
  client,
  createSceneItemReqs,
  createSceneReq,
  parallelism,
  polling,
  verbose,
  onProgress,
}: CreateSceneWithSceneItemsArgs): Promise<SceneData> {
  const createSceneRes = await client.scenes.createScene({
    createSceneRequest: createSceneReq(),
  });
  const sceneId = createSceneRes.data.data.id;
  const total = createSceneItemReqs.length;
  if (verbose) {
    console.log(`Created scene ${sceneId}`);
    console.log(`Creating ${total} queued-scene-items...`);
  }

  let complete = 0;
  const limit = pLimit(parallelism);
  const responses = await Promise.all(
    createSceneItemReqs.map((req) =>
      limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
        async (r: CreateSceneItemRequest) => {
          const res = await client.sceneItems.createSceneItem({
            id: sceneId,
            createSceneItemRequest: r,
          });
          if (onProgress) onProgress((complete += 1), total);
          return res;
        },
        req
      )
    )
  );

  if (verbose)
    console.log(`Created queued-scene-items. Polling for completion...`);

  await pollQueuedJob<SceneItem>({
    id: responses[responses.length - 1].data.data.id,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    allow404: true,
    polling,
  });

  if (verbose) console.log(`Committing scene and polling until ready...`);

  await client.scenes.updateScene({
    id: sceneId,
    updateSceneRequest: {
      data: {
        attributes: {
          state: UpdateSceneRequestDataAttributesStateEnum.Commit,
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });
  await pollSceneReady({ client, id: sceneId, polling, verbose });

  if (verbose) console.log(`Fitting scene's camera to scene-items...`);

  const scene = await client.scenes.updateScene({
    id: sceneId,
    updateSceneRequest: {
      data: {
        attributes: {
          camera: { type: CameraFitTypeEnum.FitVisibleSceneItems },
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });

  return scene.data.data;
}

/**
 * Delete all scenes.
 *
 * @param args - The {@link DeleteArgs}.
 */
export async function deleteAllScenes({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs): Promise<void> {
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(ids.map((id) => client.scenes.deleteScene({ id })));
    if (verbose) console.log(`Deleting scene(s) ${ids.join(', ')}`);
  } while (cursor);
}

/**
 * Poll a scene until it reaches the ready state.
 *
 * @param args - The {@link PollSceneReadyArgs}.
 */
export async function pollSceneReady({
  client,
  id,
  polling = {
    intervalMs: PollIntervalMs,
    maxAttempts: MaxAttempts,
  },
}: PollSceneReadyArgs): Promise<Scene> {
  const poll = async (): Promise<Scene> =>
    new Promise((resolve) => {
      setTimeout(
        async () => resolve((await client.scenes.getScene({ id })).data),
        polling.intervalMs
      );
    });

  let attempts = 1;
  let scene = await poll();
  while (scene.data.attributes.state !== 'ready') {
    attempts += 1;
    if (attempts > polling.maxAttempts)
      throw new Error(
        `Polled scene ${id} ${polling.maxAttempts} times, giving up.`
      );
    scene = await poll();
  }

  return scene;
}

/**
 * Render a scene.
 *
 * @param args - The {@link RenderImageArgs}.
 */
export async function renderScene<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageArgs): Promise<AxiosResponse<T>> {
  return await client.scenes.renderScene(
    { id, height, width },
    { responseType: 'stream' }
  );
}
