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
  BaseReq,
  defined,
  DeleteReq,
  getPage,
  hasVertexError,
  isQueuedJob,
  MaxAttempts,
  partition,
  Polling,
  PollIntervalMs,
  RenderImageReq,
  tryStream,
  VertexClient,
} from '../index';
import { toAccept } from '../utils';
import { isPollError, pollQueuedJob, throwOnError } from './queued-jobs';

export interface CreateSceneAndSceneItemsReq extends BaseReq {
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
  readonly onProgress?: (complete: number, total: number) => void;

  /** How many requests to run in parallel. */
  readonly parallelism: number;
}

export interface CreateSceneItemsRes {
  leaves: number;
  queuedSceneItems: QueuedSceneItem[];
}

/**
 * Poll scene ready arguments.
 */
export interface PollSceneReadyReq extends BaseReq {
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
  req: CreateSceneItemRequest;
  res?: Failure | QueuedJob;
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
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  verbose,
}: CreateSceneAndSceneItemsReq): Promise<CreateSceneAndSceneItemsRes> {
  const scene = (
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data;
  const sceneId = scene.data.id;
  const res = await createSceneItems({
    client,
    createSceneItemReqs,
    failFast: failFast ?? false,
    onProgress,
    parallelism,
    sceneId,
  });
  const { a: queuedItems, b: errors } = partition(
    res.queuedSceneItems,
    (i: QueuedSceneItem) => isQueuedJob(i.res)
  );

  if (queuedItems.length === 0 || errors.length === res.leaves)
    return { errors, scene };

  const limit = pLimit(parallelism);
  await Promise.all(
    queuedItems.map((is) =>
      limit<QueuedSceneItem[], void>(async (req: QueuedSceneItem) => {
        const r = await pollQueuedJob<SceneItem>({
          id: (req.res as QueuedJob).data.id,
          getQueuedJob: (id) => client.sceneItems.getQueuedSceneItem({ id }),
          allow404: true,
          polling,
        });
        if (isPollError(r.res)) {
          failFast
            ? throwOnError(r)
            : errors.push({ req: req.req, res: r.res });
        }
      }, is)
    )
  );

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
  let leaves = 0;
  const queuedSceneItems = await Promise.all(
    createSceneItemReqs.map((r) =>
      limit<CreateSceneItemRequest[], QueuedSceneItem>(
        async (req: CreateSceneItemRequest) => {
          let res: Failure | QueuedJob | undefined;
          try {
            if (
              defined(req.data.attributes.source) ||
              defined(req.data.relationships.source)
            ) {
              leaves++;
            }
            res = (
              await client.sceneItems.createSceneItem({
                id: sceneId,
                createSceneItemRequest: req,
              })
            ).data;
          } catch (error) {
            if (!failFast && hasVertexError(error)) {
              res = error.vertexError?.res;
            } else throw error;
          }

          if (onProgress != null) {
            complete += 1;
            onProgress(complete, createSceneItemReqs.length);
          }

          return { req, res };
        },
        r
      )
    )
  );

  return { leaves, queuedSceneItems };
}

/**
 * Delete all scenes.
 *
 * @param args - The {@link DeleteReq}.
 */
export async function deleteAllScenes({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteReq): Promise<SceneData[]> {
  let scenes: SceneData[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(ids.map((id) => client.scenes.deleteScene({ id })));
    scenes = scenes.concat(res.page.data);
  } while (cursor);

  return scenes;
}

/**
 * Poll a scene until it reaches the ready state.
 *
 * @param args - The {@link PollSceneReadyReq}.
 */
export async function pollSceneReady({
  client,
  id,
  polling = {
    intervalMs: PollIntervalMs,
    maxAttempts: MaxAttempts,
  },
}: PollSceneReadyReq): Promise<Scene> {
  const poll = (): Promise<Scene> =>
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
    // eslint-disable-next-line no-await-in-loop
    scene = await poll();
  }

  return scene;
}

/**
 * Render a scene.
 *
 * @param args - The {@link RenderImageReq}.
 */
export function renderScene<T>({
  client,
  renderReq: { id, height, type = 'png', width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(() =>
    client.scenes.renderScene(
      { id, height, width },
      { headers: { accept: toAccept(type) }, responseType: 'stream' }
    )
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
