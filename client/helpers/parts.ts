import { AxiosResponse } from 'axios';
import {
  CreateFileRequest,
  CreatePartRequest,
  Part,
  PartData,
  PartList,
  PartRevisionData,
  PartRevisionList,
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

  /** File data, use {@link Buffer} in Node. */
  readonly fileData: unknown;

  /** {@link Polling} */
  readonly polling?: Polling;
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
export async function createPartFromFileIfNotExists({
  client,
  createFileReq,
  createPartReq,
  fileData,
  onMsg = console.log,
  polling = { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  verbose,
}: CreatePartFromFileReq): Promise<PartRevisionData> {
  const file = await uploadFileIfNotExists({
    client,
    verbose,
    fileData,
    createFileReq,
    onMsg,
  });
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
      return existingPartRev;
    }
  }

  const createPartRes = await client.parts.createPart({ createPartRequest });
  const queuedId = createPartRes.data.data.id;
  if (verbose)
    onMsg(`Created part with queued-translation ${queuedId}, file ${file.id}`);

  const pollRes = await pollQueuedJob<Part>({
    id: queuedId,
    getQueuedJob: (id) =>
      client.translationInspections.getQueuedTranslation({ id }),
    polling,
  });
  if (isPollError(pollRes.res)) {
    throwOnError({ maxAttempts: polling.maxAttempts, pollRes });
  }

  const partRev = head(
    pollRes.res.included?.filter(
      (pr) => pr.attributes.suppliedId === suppliedRevisionId
    )
  );
  if (!partRev)
    throw new Error(
      `Error creating part revision.\nRes: ${prettyJson(pollRes.res?.data)}`
    );

  if (verbose)
    onMsg(`Created part ${pollRes.res?.data.id}, part-revision ${partRev.id}`);

  return partRev;
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
    const res = await getPage(() =>
      client.parts.getParts({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
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
export async function renderPartRevision<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageReq): Promise<AxiosResponse<T>> {
  return tryStream(async () =>
    client.partRevisions.renderPartRevision(
      { id, height, width },
      { responseType: 'stream' }
    )
  );
}
