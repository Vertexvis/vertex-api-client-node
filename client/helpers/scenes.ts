import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import { hrtime } from 'process';

import {
  ApiError,
  Batch,
  BatchOperation,
  BatchOperationOpEnum,
  BatchOperationRefTypeEnum,
  CameraFitTypeEnum,
  CreateSceneItemRequest,
  CreateSceneItemRequestData,
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
import { arrayChunked, delay, isApiError, toAccept } from '../utils';
import {
  isBatch,
  isPollError,
  pollQueuedJob,
  PollQueuedJobRes,
  throwOnError,
} from './queued-jobs';

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

  /** Whether or not to return queued scene items. */
  readonly returnQueued?: boolean;
}

export interface CreateSceneAndSceneItemsReqEXPERIMENTAL extends BaseReq {
  /** A list of {@link CreateSceneItemRequest}. */
  readonly createSceneItemReqs: Array<Array<CreateSceneItemRequest>>;

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

  /** Whether or not to return queued scene items. */
  readonly returnQueued?: boolean;
}

export interface CreateSceneAndSceneItemsRes {
  readonly errors: QueuedSceneItem[];
  readonly scene: Scene;

  /** Only populated if `returnQueued` is true in request. */
  readonly queued: QueuedSceneItem[];
}

export interface CreateSceneAndSceneItemsResEXPERIMENTAL {
  readonly errors: QueuedBatchOps[];
  readonly scene: Scene;
  readonly sceneItemErrors: SceneItemError[];

  /** Only populated if `returnQueued` is true in request. */
  readonly queued: QueuedBatchOps[];
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
  readonly leaves: number;
  readonly queuedSceneItems: QueuedSceneItem[];
}

export interface CreateSceneItemsResEXPERIMENTAL {
  readonly chunks: number;
  readonly queuedBatchOps: QueuedBatchOps[];
}

export interface QueuedBatchOps {
  readonly ops: BatchOperation[];
  readonly res?: Failure | QueuedJob;
}

export interface SceneItemError {
  readonly req: CreateSceneItemRequestData;
  readonly res?: ApiError;
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
  readonly scene: Scene;
}

interface Base {
  /** An instance of {@link VertexClient}. */
  readonly client: VertexClient;

  /** ID of scene. */
  readonly sceneId: string;
}

export interface QueuedSceneItem {
  readonly req: CreateSceneItemRequest;
  readonly res?: Failure | QueuedJob;
}

const PollPercentage = 10;

/**
 * Create a scene with scene items.
 */
export async function createSceneAndSceneItems({
  client,
  createSceneItemReqs,
  createSceneReq,
  failFast = false,
  onMsg = console.log,
  onProgress,
  parallelism,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  returnQueued = false,
  verbose,
}: CreateSceneAndSceneItemsReq): Promise<CreateSceneAndSceneItemsRes> {
  const scene = (
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data;
  const sceneId = scene.data.id;
  const createRes = await createSceneItems({
    client,
    createSceneItemReqs,
    failFast,
    onProgress,
    parallelism,
    sceneId,
  });
  const { a: queuedItems, b: errors } = partition(
    createRes.queuedSceneItems,
    (i) => isQueuedJob(i.res)
  );
  const queued = returnQueued ? createRes.queuedSceneItems : [];
  if (queuedItems.length === 0 || errors.length === createRes.leaves) {
    return { errors, queued, scene };
  }

  if (verbose) onMsg(`Polling for completed scene-items...`);

  const limit = pLimit(Math.min(parallelism, 20));
  const cnt = queuedItems.length;
  const step = Math.floor(cnt / ((PollPercentage / 100) * cnt));
  const qis = [];
  // Poll for percentage of items starting at end of `queuedItems` array
  for (let i = 0; i < cnt; i += step) qis.push(queuedItems[cnt - i - 1]);

  async function poll({ req, res }: QueuedSceneItem): Promise<void> {
    const r = await pollQueuedJob<SceneItem>({
      id: (res as QueuedJob).data.id,
      getQueuedJob: (id, cancelToken) =>
        client.sceneItems.getQueuedSceneItem({ id }, { cancelToken }),
      allow404: true,
      limit,
      polling,
    });
    if (isPollError(r.res)) {
      failFast ? throwOnError(r) : errors.push({ req, res: r.res });
    }
  }
  await Promise.all(qis.map((is) => limit<QueuedSceneItem[], void>(poll, is)));

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
  return { errors, queued, scene: updated };
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
 * Create a scene with scene items using experimental strategy.
 */
export async function createSceneAndSceneItemsEXPERIMENTAL({
  client,
  createSceneItemReqs,
  createSceneReq,
  failFast = false,
  onMsg = console.log,
  onProgress,
  parallelism,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  returnQueued = false,
  verbose,
}: CreateSceneAndSceneItemsReqEXPERIMENTAL): Promise<CreateSceneAndSceneItemsResEXPERIMENTAL> {
  const startTime = hrtime.bigint();
  if (verbose) onMsg(`Creating scene...`);
  const scene = (
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data;
  const sceneId = scene.data.id;

  if (verbose) onMsg(`Creating scene items...`);
  let itemCount = 0;
  let batchQueuedOps: QueuedBatchOps[] = [];
  let batchErrors: QueuedBatchOps[] = [];
  let sceneItemErrors: SceneItemError[] = [];
  for (let depth = 0; depth < createSceneItemReqs.length; depth++) {
    const createItemReqs: CreateSceneItemRequest[] = createSceneItemReqs[depth];
    itemCount += createItemReqs.length;
    if (verbose)
      onMsg(
        `Creating ${createItemReqs.length} scene items at depth ${depth}...`
      );

    // Await is used intentionally to defer loop iteration
    // until all scene items have been created at each depth.

    // eslint-disable-next-line no-await-in-loop
    const createRes = await createSceneItemsEXPERIMENTAL({
      client,
      createSceneItemReqs: createItemReqs,
      failFast,
      onProgress,
      parallelism,
      sceneId,
    });
    const { a: queuedOps, b: errors } = partition(
      createRes.queuedBatchOps,
      (i) => isQueuedJob(i.res)
    );
    batchQueuedOps = batchQueuedOps.concat(queuedOps);
    if (errors.length) {
      batchErrors = batchErrors.concat(errors);
      if (verbose)
        onMsg(
          `WARNING: ${errors.length} scene item batch errors at depth ${depth}.`
        );
    }
    // Nothing succeeded, return early as something is likely wrong
    if (queuedOps.length === 0 || errors.length === createRes.chunks) {
      return {
        errors,
        queued: returnQueued ? createRes.queuedBatchOps : [],
        scene,
        sceneItemErrors: [],
      };
    }

    const limit = pLimit(Math.min(parallelism, 20));
    async function poll({
      ops,
      res,
    }: QueuedBatchOps): Promise<PollQueuedJobRes<Batch>> {
      const r = await pollQueuedJob<Batch>({
        id: (res as QueuedJob).data.id,
        getQueuedJob: (id, cancelToken) =>
          client.batches.getQueuedBatch({ id }, { cancelToken }),
        allow404: true,
        limit,
        polling,
      });
      if (isPollError(r.res)) {
        failFast ? throwOnError(r) : errors.push({ ops, res: r.res });
      }
      return r;
    }
    // eslint-disable-next-line no-await-in-loop
    const batchRes = await Promise.all(
      queuedOps.map((is) =>
        limit<QueuedBatchOps[], PollQueuedJobRes<Batch>>(poll, is)
      )
    );
    const batchItemErrors = batchRes
      .flatMap((b, i) =>
        isBatch(b.res)
          ? b.res['vertexvis/batch:results'].map((r, j) =>
              isApiError(r)
                ? { req: queuedOps[i].ops[j].data, res: r }
                : undefined
            )
          : []
      )
      .filter(defined);
    if (batchItemErrors.length) {
      sceneItemErrors = sceneItemErrors.concat(batchItemErrors);
      if (verbose)
        onMsg(
          `WARNING: ${batchItemErrors.length} scene item creation errors at depth ${depth}.`
        );
    }
  }

  if (verbose) {
    onMsg(
      `Scene item creation complete for ${itemCount} scene items with max depth of ${
        createSceneItemReqs.length - 1
      }.`
    );
    if (batchErrors.length) {
      onMsg(`  Batch errors: ${batchErrors.length}`);
    }
    if (sceneItemErrors.length) {
      onMsg(`  Scene item errors: ${sceneItemErrors.length}`);
    }
  }

  if (verbose) onMsg(`Committing scene and polling until ready...`);

  await updateScene({
    attributes: { state: UpdateSceneRequestDataAttributesStateEnum.Commit },
    client,
    sceneId,
  });
  await pollSceneReady({ client, id: sceneId, onMsg, polling, verbose });

  if (verbose) onMsg(`Fitting scene's camera to scene items...`);
  const sceneResult = (
    await updateScene({
      attributes: {
        camera: { type: CameraFitTypeEnum.FitVisibleSceneItems },
      },
      client,
      sceneId,
    })
  ).scene;

  if (verbose) {
    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.round(seconds % 60);
      return [h, m > 9 ? m : h ? '0' + m : m || '0', s > 9 ? s : '0' + s]
        .filter(Boolean)
        .join(':');
    };
    onMsg(
      `Scene creation completed in ${formatTime(
        Number(hrtime.bigint() - startTime) / 1000000000
      )}.`
    );
  }
  return {
    errors: batchErrors,
    queued: batchQueuedOps,
    scene: sceneResult,
    sceneItemErrors,
  };
}

/**
 * Create scene items within a scene.
 */
export async function createSceneItemsEXPERIMENTAL({
  client,
  createSceneItemReqs,
  failFast,
  parallelism,
  sceneId,
}: CreateSceneItemsReq): Promise<CreateSceneItemsResEXPERIMENTAL> {
  const limit = pLimit(parallelism);
  const batchSize = 500;

  const opChunks = arrayChunked(
    createSceneItemReqs.map((req) => ({
      data: req.data,
      op: BatchOperationOpEnum.Add,
      ref: {
        type: BatchOperationRefTypeEnum.Scene,
        id: sceneId,
      },
    })),
    batchSize
  );

  const queuedBatchOps = await Promise.all(
    opChunks.map((opChunk) =>
      limit<BatchOperation[][], QueuedBatchOps>(
        async (ops: BatchOperation[]) => {
          let res: Failure | QueuedJob | undefined;
          try {
            res = (
              await client.batches.createBatch({
                createBatchRequest: { 'vertexvis/batch:operations': ops },
              })
            ).data;
          } catch (error) {
            if (!failFast && hasVertexError(error)) {
              res = error.vertexError?.res;
            } else throw error;
          }

          return { ops, res };
        },
        opChunk
      )
    )
  );

  return { chunks: opChunks.length, queuedBatchOps };
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
  polling: { intervalMs, maxAttempts } = {
    intervalMs: PollIntervalMs,
    maxAttempts: MaxAttempts,
  },
}: PollSceneReadyReq): Promise<Scene> {
  async function poll(): Promise<Scene> {
    return (await client.scenes.getScene({ id })).data;
  }

  let attempts = 1;
  let scene = await poll();
  /* eslint-disable no-await-in-loop */
  while (scene.data.attributes.state !== 'ready') {
    attempts += 1;
    if (attempts > maxAttempts)
      throw new Error(`Polled scene ${id} ${maxAttempts} times, giving up.`);
    await delay(intervalMs);
    scene = await poll();
  }
  /* eslint-enable no-await-in-loop */

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
