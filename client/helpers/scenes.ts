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
  tryStream,
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
  onMsg = console.log,
  onProgress,
  parallelism,
  polling,
  verbose,
}: CreateSceneWithSceneItemsArgs): Promise<SceneData> {
  const sceneId = (
    await client.scenes.createScene({
      createSceneRequest: createSceneReq(),
    })
  ).data.data.id;
  const limit = pLimit(parallelism);
  let complete = 0;
  const responses = await Promise.all(
    createSceneItemReqs.map((req) =>
      limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
        async (r: CreateSceneItemRequest) => {
          const res = await client.sceneItems.createSceneItem({
            id: sceneId,
            createSceneItemRequest: r,
          });
          if (onProgress)
            onProgress((complete += 1), createSceneItemReqs.length);
          return res;
        },
        req
      )
    )
  );

  await pollQueuedJob<SceneItem>({
    id: responses[responses.length - 1].data.data.id,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    allow404: true,
    polling,
  });

  if (verbose) onMsg(`Committing scene and polling until ready...`);

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
  await pollSceneReady({ client, id: sceneId, onMsg, polling, verbose });

  if (verbose) onMsg(`Fitting scene's camera to scene-items...`);

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
}: DeleteArgs): Promise<SceneData[]> {
  let scenes: SceneData[] = [];
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(ids.map((id) => client.scenes.deleteScene({ id })));
    scenes = scenes.concat(res.page.data);
  } while (cursor);

  return scenes;
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
  return tryStream(async () =>
    client.scenes.renderScene({ id, height, width }, { responseType: 'stream' })
  );
}
