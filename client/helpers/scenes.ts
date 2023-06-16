import {
  MetadataValue,
  MetadataValueTypeEnum,
  RelationshipData,
} from '@vertexvis/api-client-node';
import { AxiosResponse } from 'axios';
import pLimit, { Limit } from 'p-limit';
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
  isPartNotFoundError,
  isQueuedJob,
  MaxAttempts,
  partition,
  Polling,
  PollIntervalMs,
  RenderImageReq,
  SceneItemSystemMetadata,
  tryStream,
  VertexClient,
} from '../index';
import {
  arrayChunked,
  delay,
  formatTime,
  isApiError,
  isSceneItemRelationship,
  toAccept,
} from '../utils';
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

export interface CreateSceneAndSceneItemsRes {
  readonly errors: QueuedBatchOps[];
  readonly scene?: Scene;
  readonly sceneItemErrors: SceneItemError[];

  /** Only populated if `returnQueued` is true in request. */
  readonly queued: QueuedBatchOps[];
}

export interface CreateSceneItemBatchReq extends CreateSceneItemsReq {
  /** {@link Polling} */
  readonly polling?: Polling;
}

export interface CreateSceneItemBatchRes {
  batchOps: QueuedBatchOps[];
  batchErrors: QueuedBatchOps[];
  itemErrors: SceneItemError[];
  itemResults: SceneItemResult[];
}

export interface CreateSceneItemsReq extends Base {
  /** A list of {@link CreateSceneItemRequest}. */
  readonly createSceneItemReqs: CreateSceneItemRequest[];

  /** Whether or not to fail if any scene item fails initial validation. */
  readonly failFast: boolean;

  /** Callback with total number of requests and number complete. */
  readonly onProgress?: (complete: number, total: number) => void;

  /** Limit for requests to run in parallel. */
  readonly limit: Limit;
}

export interface CreateSceneItemsRes {
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
  placeholderItem?: RelationshipData;
}

export interface SceneItemResult {
  readonly req: CreateSceneItemRequestData;
  readonly res: RelationshipData | ApiError;
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

const defaultPolling: Polling = { intervalMs: 200, maxAttempts: 4500 }; // 15 minute timeout for batch completions
const sceneReadyPolling: Polling = { intervalMs: 1000, maxAttempts: 3600 }; // one hour timeout for scene state ready

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
  polling = defaultPolling,
  returnQueued = false,
  verbose,
}: CreateSceneAndSceneItemsReq): Promise<CreateSceneAndSceneItemsRes> {
  const limit = pLimit(Math.min(parallelism, 100));
  const startTime = hrtime.bigint();
  if (verbose) onMsg(`Creating scene...`);
  const scene = (
    await client.scenes.createScene({ createSceneRequest: createSceneReq() })
  ).data;
  const sceneId = scene.data.id;
  if (verbose) onMsg(`Scene ID: ${sceneId}`);
  if (verbose) onMsg(`Creating scene items...`);
  let itemCount = 0;
  let createFailed = false;
  let sceneResult;

  const reqMap: Map<string, CreateSceneItemRequest[]> = new Map();
  // create parent map and set ordinals based on request order
  createSceneItemReqs.forEach((req) => {
    const reqParent =
      req.data.attributes.parent ??
      req.data.relationships.parent?.data.id ??
      '';
    if (!reqMap.has(reqParent)) {
      reqMap.set(reqParent, []);
    }
    const siblings = reqMap.get(reqParent);
    if (req.data.attributes.ordinal === undefined) {
      req.data.attributes.ordinal = siblings?.length;
    }
    siblings?.push(req);
  });

  // sort all scene item requests into depth sorted array of arrays
  const depthSortedItems: CreateSceneItemRequest[][] = [];
  // fetch list of scene items with no parent (root items)
  let nextChildren: CreateSceneItemRequest[] = reqMap.get('') || [];
  reqMap.delete('');
  while (nextChildren.length) {
    depthSortedItems.push(nextChildren);
    nextChildren = nextChildren.flatMap((req) => {
      if (
        req.data.attributes.suppliedId &&
        reqMap.has(req.data.attributes.suppliedId)
      ) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const children = reqMap.get(req.data.attributes.suppliedId)!;
        reqMap.delete(req.data.attributes.suppliedId);
        return children;
      } else {
        return [];
      }
    });
  }

  let resultQueuedOps: QueuedBatchOps[] = [];
  let resultBatchErrors: QueuedBatchOps[] = [];
  let resultItemErrors: SceneItemError[] = [];

  // if we had any scene item requests with invalid parents,
  // add error entries indicating so.
  reqMap.forEach((children: CreateSceneItemRequest[]) => {
    children.forEach((childItem) => {
      resultItemErrors.push({
        req: childItem.data,
        res: {
          status: '404',
          code: 'NotFound',
          title: 'The requested resource was not found.',
          source: { pointer: '/body/data/attributes/parent' },
        },
      });
    });
  });

  let depth = 0;
  for (depth; depth < depthSortedItems.length; depth++) {
    const createItemReqs: CreateSceneItemRequest[] = depthSortedItems[depth];
    itemCount += createItemReqs.length;
    if (verbose)
      onMsg(
        `Creating ${createItemReqs.length} scene items at depth ${depth}...`
      );
    // Await is used intentionally to defer loop iteration
    // until all scene items have been created at each depth.
    const {
      batchOps: queuedBatchOps,
      batchErrors: queuedBatchErrors,
      itemErrors: batchItemErrors,
    } =
      // eslint-disable-next-line no-await-in-loop
      await createSceneItemBatch({
        client,
        createSceneItemReqs: createItemReqs,
        failFast,
        onProgress,
        limit,
        sceneId,
        polling,
      });

    resultQueuedOps = resultQueuedOps.concat(queuedBatchOps);
    resultBatchErrors = resultBatchErrors.concat(queuedBatchErrors);

    if (batchItemErrors.length) {
      if (verbose)
        onMsg(
          `WARNING: ${batchItemErrors.length} scene item creation errors at depth ${depth}.`
        );
      resultItemErrors = resultItemErrors.concat(batchItemErrors);
      if (failFast) {
        createFailed = true;
        break;
      } else {
        // evaluate item errors and generate retry list
        const retryErrors: SceneItemError[] = batchItemErrors.filter((v) =>
          isPartNotFoundError(v.res)
        );
        const retries: CreateSceneItemRequest[] =
          retryErrors.map<CreateSceneItemRequest>((itemError) => {
            const item = itemError.req;
            return {
              data: {
                type: 'scene-item',
                attributes: {
                  ...item.attributes,
                  metadata: {
                    ...item.attributes.metadata,
                    [SceneItemSystemMetadata.IsMissingGeometry]:
                      toMetadataOrUndefined('1'),
                    [SceneItemSystemMetadata.MissingGeometrySetId]:
                      toMetadataOrUndefined(
                        item.relationships.source?.data.id,
                        item.relationships.source?.data.type === 'geometry-set'
                      ),
                    [SceneItemSystemMetadata.MissingPartRevisionId]:
                      toMetadataOrUndefined(
                        item.relationships.source?.data.id,
                        item.relationships.source?.data.type === 'part-revision'
                      ),
                    [SceneItemSystemMetadata.MissingSuppliedPartId]:
                      toMetadataOrUndefined(
                        item.attributes.source?.suppliedPartId
                      ),
                    [SceneItemSystemMetadata.MissingSuppliedPartRevisionId]:
                      toMetadataOrUndefined(
                        item.attributes.source?.suppliedRevisionId
                      ),
                  },
                  source: undefined,
                },
                relationships: {
                  ...item.relationships,
                  source: undefined,
                },
              },
            };
          });

        if (retries.length > 0) {
          onMsg(
            `Creating ${retries.length} placeholder scene items at depth ${depth}.`
          );
          // wait for placeholders to be created
          const { itemResults: placeholderItemResults } =
            // eslint-disable-next-line no-await-in-loop
            await createSceneItemBatch({
              client,
              createSceneItemReqs: retries,
              failFast,
              onProgress,
              limit,
              sceneId,
              polling,
            });

          // attach placeholder references to item errors
          placeholderItemResults.forEach((resultItem, i) => {
            if (isSceneItemRelationship(resultItem.res)) {
              retryErrors[i].placeholderItem = resultItem.res;
            }
          });
        }
      }
    }
  }

  if (createFailed) {
    if (verbose) {
      onMsg(
        `Scene item creation failed in ${formatTime(
          Number(hrtime.bigint() - startTime) / 1000000000
        )} at depth ${depth}.`
      );
    }
  } else {
    if (verbose) {
      onMsg(
        `Scene item creation completed in ${formatTime(
          Number(hrtime.bigint() - startTime) / 1000000000
        )} for ${itemCount} scene items with max depth of ${
          depthSortedItems.length - 1
        }.`
      );

      if (resultBatchErrors.length) {
        onMsg(`Batch errors: ${resultBatchErrors.length}`);
      }
      if (resultItemErrors.length) {
        onMsg(`Scene item errors: ${resultItemErrors.length}`);
      }
    }

    if (verbose) onMsg(`Committing scene and polling until ready...`);

    await updateScene({
      attributes: { state: UpdateSceneRequestDataAttributesStateEnum.Commit },
      client,
      sceneId,
    });
    await pollSceneReady({
      client,
      id: sceneId,
      onMsg,
      polling: sceneReadyPolling,
      verbose,
    });

    if (verbose) onMsg(`Fitting scene's camera to scene items...`);
    sceneResult = (
      await updateScene({
        attributes: {
          camera: { type: CameraFitTypeEnum.FitVisibleSceneItems },
        },
        client,
        sceneId,
      })
    ).scene;
  }

  if (verbose) {
    onMsg(
      `Scene creation completed in ${formatTime(
        Number(hrtime.bigint() - startTime) / 1000000000
      )}.`
    );
  }
  return {
    errors: resultBatchErrors,
    queued: returnQueued ? resultQueuedOps : [],
    scene: sceneResult,
    sceneItemErrors: resultItemErrors,
  };
}

/**
 * Helper function for building a metadata string object.
 *
 * @param value Value to convert to metadata object
 * @param condition Setting to `false` will cause result to be `undefined`
 * @returns Instance of a `MetadataValue` object
 */
function toMetadataOrUndefined(
  value: string | undefined,
  condition = true
): MetadataValue {
  return condition && defined(value)
    ? {
        type: MetadataValueTypeEnum.String,
        value,
      }
    : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      undefined!;
}

/**
 * This async function takes a long list of create scene item data and handles
 * batch based scene item creation. Batch operation results and errors are
 * returned to the caller.
 */
const createSceneItemBatch = async ({
  client,
  createSceneItemReqs: createItemReqs,
  failFast,
  onProgress,
  limit,
  sceneId,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
}: CreateSceneItemBatchReq): Promise<CreateSceneItemBatchRes> => {
  let batchErrors: QueuedBatchOps[] = [];
  let itemErrors: SceneItemError[] = [];
  let itemResults: SceneItemResult[] = [];

  const createRes = await createSceneItems({
    client,
    createSceneItemReqs: createItemReqs,
    failFast,
    onProgress,
    limit,
    sceneId,
  });

  const { a: batchOps, b: errors } = partition(createRes.queuedBatchOps, (i) =>
    isQueuedJob(i.res)
  );
  if (errors.length) {
    batchErrors = batchErrors.concat(errors);
  }
  // Nothing succeeded, return early as something is likely wrong
  if (batchOps.length === 0 || errors.length === createRes.chunks) {
    return { batchOps, batchErrors, itemErrors, itemResults };
  } else {
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
      batchOps.map((is) =>
        limit<QueuedBatchOps[], PollQueuedJobRes<Batch>>(poll, is)
      )
    );
    itemResults = batchRes.flatMap((b, i) =>
      isBatch(b.res)
        ? b.res['vertexvis/batch:results'].map((r, j) => {
            return { req: batchOps[i].ops[j].data, res: r };
          })
        : []
    );
    itemErrors = itemErrors.concat(
      itemResults.filter((resultItem) => isApiError(resultItem.res))
    );
  }

  // if the full batch failed add batch item error for each item
  errors.forEach((error) => {
    console.log(error);
    error.ops.forEach((op) => {
      // `error.res` guaranteed to be non-null due to `isApiError()` condition above
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      itemErrors.push({ req: op.data, res: error.res! });
    });
  });

  return { batchOps, batchErrors, itemErrors, itemResults };
};

/**
 * Create scene items within a scene.
 */
export async function createSceneItems({
  client,
  createSceneItemReqs,
  failFast,
  limit,
  sceneId,
}: CreateSceneItemsReq): Promise<CreateSceneItemsRes> {
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
