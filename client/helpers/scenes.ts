import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import {
  CameraFitTypeEnum,
  CreateSceneItemRequest,
  CreateSceneRequest,
  Failure,
  QueuedJob,
  Scene,
  SceneData,
  SceneItem,
  SceneRelationshipDataTypeEnum,
  UpdateSceneRequestDataAttributes,
  UpdateSceneRequestDataAttributesStateEnum,
} from '../../index';
import {
  BaseArgs,
  DeleteArgs,
  getPage,
  hasVertexError,
  MaxAttempts,
  nullOrUndefined,
  partition,
  Polling,
  PollIntervalMs,
  pollQueuedJob,
  RenderImageArgs,
  tryStream,
  VertexClient,
} from '../index';

export interface CreateSceneAndSceneItemsReq extends BaseArgs {
  /** A list of {@link CreateSceneItemRequest}. */
  readonly createSceneItemReqs: CreateSceneItemRequest[];

  /** Function returning a {@link CreateSceneRequest}. */
  readonly createSceneReq: () => CreateSceneRequest;

  /** Whether or not to fail if any scene item fails initial validation. */
  readonly failFast?: boolean;

  /** How many requests to run in parallel. */
  readonly parallelism: number;

  /** {@link Polling} */
  readonly polling?: Polling;

  /** Callback with total number of requests and number complete. */
  onProgress?: (complete: number, total: number) => void;
}

export interface CreateSceneAndSceneItemsRes {
  errors: QueuedSceneItem[];
  scene: Scene;
}

export interface CreateSceneItemsReq extends Base {
  /** A list of {@link CreateSceneItemRequest}. */
  readonly createSceneItemReqs: CreateSceneItemRequest[];

  /** Whether or not to fail if any scene item fails initial validation. */
  readonly failFast: boolean;

  /** Callback with total number of requests and number complete. */
  readonly onProgress: ((complete: number, total: number) => void) | undefined;

  /** How many requests to run in parallel. */
  readonly parallelism: number;
}

export interface CreateSceneItemsRes {
  queuedSceneItems: QueuedSceneItem[];
}

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

export interface UpdateSceneReq extends Base {
  readonly attributes: UpdateSceneRequestDataAttributes;
}

export interface UpdateSceneRes {
  scene: Scene;
}

interface Base {
  /** An instance of {@link VertexClient}. */
  readonly client: VertexClient;

  /** ID of scene. */
  readonly sceneId: string;
}

interface QueuedSceneItem {
  failure?: Failure;
  job?: QueuedJob;
  req: CreateSceneItemRequest;
}

/**
 * Create a scene with scene items.
 */
export async function createSceneAndSceneItems({
  client,
  createSceneItemReqs,
  createSceneReq,
  failFast,
  onMsg = console.log,
  onProgress,
  parallelism,
  polling,
  verbose,
}: CreateSceneAndSceneItemsReq): Promise<CreateSceneAndSceneItemsRes> {
  const scene = (
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data;
  const sceneId = scene.data.id;
  const { a: queuedItems, b: errors } = partition(
    (
      await createSceneItems({
        client,
        createSceneItemReqs,
        failFast: failFast ?? false,
        onProgress,
        parallelism,
        sceneId,
      })
    ).queuedSceneItems,
    (i: QueuedSceneItem) => !nullOrUndefined(i.job)
  );

  if (queuedItems.length === 0) return { errors, scene };

  await pollQueuedJob<SceneItem>({
    id: (queuedItems[queuedItems.length - 1].job as QueuedJob).data.id,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    allow404: true,
    polling,
  });

  if (verbose) onMsg(`Committing scene and polling until ready...`);

  await updateScene({
    attributes: { state: UpdateSceneRequestDataAttributesStateEnum.Commit },
    client,
    sceneId,
  });
  await pollSceneReady({ client, id: sceneId, onMsg, polling, verbose });

  if (verbose) onMsg(`Fitting scene's camera to scene-items...`);

  const updated = (
    await updateScene({
      attributes: { camera: { type: CameraFitTypeEnum.FitVisibleSceneItems } },
      client,
      sceneId,
    })
  ).scene;
  return { errors, scene: updated };
}

/**
 * Create scene items within a scene.
 */
export async function createSceneItems({
  client,
  createSceneItemReqs,
  failFast,
  onProgress,
  parallelism,
  sceneId,
}: CreateSceneItemsReq): Promise<CreateSceneItemsRes> {
  const limit = pLimit(parallelism);
  let complete = 0;
  const queuedSceneItems = await Promise.all(
    createSceneItemReqs.map((req) =>
      limit<CreateSceneItemRequest[], QueuedSceneItem>(
        async (r: CreateSceneItemRequest) => {
          let job: QueuedJob | undefined;
          let failure: Failure | undefined;
          try {
            job = (
              await client.sceneItems.createSceneItem({
                id: sceneId,
                createSceneItemRequest: r,
              })
            ).data;
          } catch (error) {
            if (failFast) throw error;
            if (hasVertexError(error)) failure = error.vertexError?.res;
          }
          if (onProgress)
            onProgress((complete += 1), createSceneItemReqs.length);
          return { failure, job, req: r };
        },
        req
      )
    )
  );
  return { queuedSceneItems };
}

/**
 * Create a scene with scene items.
 *
 * @deprecated Use {@link createSceneAndSceneItems} instead.
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
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data.data.id;
  const responses = (
    await createSceneItems({
      client,
      createSceneItemReqs,
      failFast: true,
      onProgress,
      parallelism,
      sceneId,
    })
  ).queuedSceneItems
    .filter((i) => !nullOrUndefined(i.job))
    .map((i) => i.job as QueuedJob);

  await pollQueuedJob<SceneItem>({
    id: responses[responses.length - 1].data.id,
    getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
    allow404: true,
    polling,
  });

  if (verbose) onMsg(`Committing scene and polling until ready...`);

  await updateScene({
    attributes: { state: UpdateSceneRequestDataAttributesStateEnum.Commit },
    client,
    sceneId,
  });
  await pollSceneReady({ client, id: sceneId, onMsg, polling, verbose });

  if (verbose) onMsg(`Fitting scene's camera to scene-items...`);

  return (
    await updateScene({
      attributes: { camera: { type: CameraFitTypeEnum.FitVisibleSceneItems } },
      client,
      sceneId,
    })
  ).scene.data;
}

/**
 * Delete all scenes.
 *
 * @param args - The {@link DeleteArgs}.
 */
export async function deleteAllScenes({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteArgs): Promise<SceneData[]> {
  let scenes: SceneData[] = [];
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
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

/**
 * Update a scene.
 */
export async function updateScene({
  attributes,
  client,
  sceneId,
}: UpdateSceneReq): Promise<UpdateSceneRes> {
  return {
    scene: (
      await client.scenes.updateScene({
        id: sceneId,
        updateSceneRequest: {
          data: { attributes, type: SceneRelationshipDataTypeEnum.Scene },
        },
      })
    ).data,
  };
}
