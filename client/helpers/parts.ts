import { AxiosResponse } from 'axios';

import {
  CreateFileRequest,
  CreateGeometrySetRequest,
  CreatePartRequest,
  Failure,
  Part,
  PartData,
  PartList,
  PartRevisionData,
  PartRevisionList,
  QueuedJob,
} from '../../index';
import {
  BaseReq,
  DeleteReq,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
  head,
  MaxAttempts,
  Polling,
  PollIntervalMs,
  prettyJson,
  RenderImageReq,
  toAccept,
  tryStream,
  uploadFileIfNotExists,
} from '../index';
import { isPollError, pollQueuedJob, throwOnError } from './queued-jobs';

/** Create parts from file arguments. */
export interface CreatePartFromFileReq extends BaseReq {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  /** Function returning a {@link CreatePartRequest}. */
  readonly createPartReq: (fileId: string) => CreatePartRequest;

  /** File data. */
  readonly fileData: Buffer;

  /** {@link Polling} */
  readonly polling?: Polling;

  /** Whether or not to return queued translation. */
  readonly returnQueued?: boolean;

  readonly bypassAxiosEXPERIMENTAL?: boolean;
}

export interface CreatePartFromFileRes {
  /** A {@link PartRevisionData}. */
  readonly partRevision: PartRevisionData;

  /** Only populated if `returnQueued` is true in request. */
  readonly queued?: QueuedTranslation;
}

export interface QueuedTranslation {
  readonly req: CreatePartRequest | CreateGeometrySetRequest;
  readonly res?: Failure | QueuedJob | Part;
}

/** Get part revision by supplied ID arguments. */
export interface GetPartRevisionBySuppliedIdReq extends BaseReq {
  /** A supplied part ID. */
  readonly suppliedPartId: string;

  /** A supplied part revision ID. */
  readonly suppliedRevisionId: string;
}

/**
 * Create part and file resources if they don't already exist.
 *
 * @param args - The {@link CreatePartFromFileReq}.
 */
export async function createPartFromFile({
  client,
  createPartReq,
  onMsg = console.log,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  returnQueued = false,
  verbose,
  ...rest
}: CreatePartFromFileReq): Promise<CreatePartFromFileRes> {
  const file = await uploadFileIfNotExists({ client, verbose, onMsg, ...rest });
  const createPartRequest = createPartReq(file.id);
  const suppliedPartId = createPartRequest.data.attributes.suppliedId;
  const suppliedRevisionId =
    createPartRequest.data.attributes.suppliedRevisionId;

  if (suppliedPartId && suppliedRevisionId) {
    const existingPartRev = await getPartRevisionBySuppliedId({
      client,
      suppliedPartId,
      suppliedRevisionId,
      verbose,
      onMsg,
    });
    if (existingPartRev) {
      if (verbose) {
        onMsg(
          `part-revision with suppliedId '${suppliedPartId}' and suppliedRevisionId ` +
            `'${suppliedRevisionId}' already exists, using it, ${existingPartRev.id}`
        );
      }
      return {
        partRevision: existingPartRev,
        queued: returnQueued ? { req: createPartRequest } : undefined,
      };
    }
  }

  const createPartRes = await client.parts.createPart({ createPartRequest });
  const queuedId = createPartRes.data.data.id;
  if (verbose)
    onMsg(`Created part with queued-translation ${queuedId}, file ${file.id}`);

  const queued = returnQueued
    ? { req: createPartRequest, res: createPartRes.data }
    : undefined;
  const pollRes = await pollQueuedJob<Part>({
    id: queuedId,
    getQueuedJob: (id) =>
      client.translationInspections.getQueuedTranslation({ id }),
    polling,
  });
  if (isPollError(pollRes.res)) throwOnError(pollRes);

  const partRevision = head(
    pollRes.res.included?.filter(
      (pr) => pr.attributes.suppliedId === suppliedRevisionId
    )
  );
  if (!partRevision)
    throw new Error(
      `Error creating part revision.\nRes: ${prettyJson(pollRes)}`
    );

  if (verbose) {
    onMsg(
      `Created part ${pollRes.res?.data.id}, part-revision ${partRevision.id}`
    );
  }

  return { partRevision, queued };
}

/**
 * Create part and file resources if they don't already exist.
 *
 * @deprecated Use {@link createPartFromFile} instead.
 *
 * @param args - The {@link CreatePartFromFileReq}.
 */
export async function createPartFromFileIfNotExists(
  req: CreatePartFromFileReq
): Promise<PartRevisionData> {
  return (await createPartFromFile(req)).partRevision;
}

/**
 * Delete all parts.
 *
 * @param args - The {@link DeleteReq}.
 */
export async function deleteAllParts({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteReq): Promise<PartData[]> {
  let parts: PartData[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await getPage(() =>
      client.parts.getParts({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(ids.map((id) => client.parts.deletePart({ id })));
    parts = parts.concat(res.page.data);
  } while (cursor);

  return parts;
}

/**
 * Get a part revision by supplied ID.
 *
 * @param args - The {@link GetPartRevisionBySuppliedIdReq}.
 */
export async function getPartRevisionBySuppliedId({
  client,
  suppliedPartId,
  suppliedRevisionId,
}: GetPartRevisionBySuppliedIdReq): Promise<PartRevisionData | undefined> {
  const existingPart = await getBySuppliedId<PartData, PartList>(
    () =>
      client.parts.getParts({
        pageSize: 1,
        filterSuppliedId: encodeIfNotEncoded(suppliedPartId),
      }),
    suppliedPartId
  );
  if (existingPart) {
    const existingPartRev = await getBySuppliedId<
      PartRevisionData,
      PartRevisionList
    >(
      () =>
        client.partRevisions.getPartRevisions({
          id: existingPart.id,
          pageSize: 1,
          filterSuppliedId: encodeIfNotEncoded(suppliedRevisionId),
        }),
      suppliedRevisionId
    );
    if (existingPartRev) return existingPartRev;
  }

  return undefined;
}

/**
 * Render a part revision.
 *
 * @param args - The {@link RenderImageReq}.
 */
export function renderPartRevision<T>({
  client,
  renderReq: { id, height, type = 'png', width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(() =>
    client.partRevisions.renderPartRevision(
      { id, height, width },
      { headers: { accept: toAccept(type) }, responseType: 'stream' }
    )
  );
}
