import { CreateSceneItemRequest, SceneItem } from '../../index';
import {
  BaseReq,
  defined,
  isApiError,
  isPollError,
  MaxAttempts,
  Polling,
  PollIntervalMs,
  pollQueuedJob,
  throwOnError,
} from '../index';

export enum SceneItemErrorStatus {
  NotFound = '404',
  ServerError = '500',
}

export enum SceneItemErrorCode {
  NotFound = 'NotFound',
  ServerError = 'ServerError',
}

export enum SceneItemErrorSourcePointer {
  Parent = '/body/data/attributes/parent',
  SourcePart = '/body/data/relationships/source/data',
}

export enum SceneItemSystemMetadata {
  IsMissingGeometry = 'VERTEX_IS_MISSING_GEOMETRY',
  MissingGeometrySetId = 'VERTEX_MISSING_GEOMETRY_SET_ID',
  MissingPartRevisionId = 'VERTEX_MISSING_PART_REVISION_ID',
  MissingSuppliedPartId = 'VERTEX_MISSING_SUPPLIED_PART_ID',
  MissingSuppliedPartRevisionId = 'VERTEX_MISSING_SUPPLIED_PART_REVISION_ID',
}

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
  if (isPollError(pollRes.res)) throwOnError(pollRes);
  if (verbose) onMsg(`Created scene-item ${pollRes.res.data.id}`);

  return pollRes.res;
}

export function isPartNotFoundError(e: unknown): boolean {
  return (
    defined(e) &&
    isApiError(e) &&
    e.code === SceneItemErrorCode.NotFound &&
    e.source !== undefined &&
    e.source.pointer === SceneItemErrorSourcePointer.SourcePart
  );
}

export function isParentNotFoundError(e: unknown): boolean {
  return (
    defined(e) &&
    isApiError(e) &&
    e.code === SceneItemErrorCode.NotFound &&
    e.source !== undefined &&
    e.source.pointer === SceneItemErrorSourcePointer.Parent
  );
}
