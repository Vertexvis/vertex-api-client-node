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
  BaseArgs,
  DeleteArgs,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
  head,
  Polling,
  pollQueuedJob,
  prettyJson,
  RenderImageArgs,
  tryStream,
  uploadFileIfNotExists,
} from '../index';

/** Create parts from file arguments. */
export interface CreatePartFromFileArgs extends BaseArgs {
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
export interface GetPartRevisionBySuppliedIdArgs extends BaseArgs {
  /** A supplied part ID. */
  readonly suppliedPartId: string;

  /** A supplied part revision ID. */
  readonly suppliedRevisionId: string;
}

/**
 * Create part and file resources if they don't already exist.
 *
 * @param args - The {@link CreatePartFromFileArgs}.
 */
export async function createPartFromFileIfNotExists({
  client,
  createFileReq,
  createPartReq,
  fileData,
  onMsg = console.log,
  polling,
  verbose,
}: CreatePartFromFileArgs): Promise<PartRevisionData> {
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

  const part = await pollQueuedJob<Part>({
    id: queuedId,
    getQueuedJob: (id) =>
      client.translationInspections.getQueuedTranslation({ id }),
    polling,
  });
  const partRev = head(
    part.included?.filter(
      (pr) => pr.attributes.suppliedId === suppliedRevisionId
    )
  );
  if (!partRev)
    throw new Error(
      `Error creating part revision.\nRes: ${prettyJson(part.data)}`
    );

  if (verbose) onMsg(`Created part-revision ${partRev.id}`);

  return partRev;
}

/**
 * Delete all parts.
 *
 * @param args - The {@link DeleteArgs}.
 */
export async function deleteAllParts({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteArgs): Promise<PartData[]> {
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
 * @param args - The {@link GetPartRevisionBySuppliedIdArgs}.
 */
export async function getPartRevisionBySuppliedId({
  client,
  suppliedPartId,
  suppliedRevisionId,
}: GetPartRevisionBySuppliedIdArgs): Promise<PartRevisionData | undefined> {
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
 * @param args - The {@link RenderImageArgs}.
 */
export async function renderPartRevision<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageArgs): Promise<AxiosResponse<T>> {
  return tryStream(async () =>
    client.partRevisions.renderPartRevision(
      { id, height, width },
      { responseType: 'stream' }
    )
  );
}
