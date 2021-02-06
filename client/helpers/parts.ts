import { AxiosResponse } from 'axios';
import {
  CreateFileRequest,
  CreatePartRequest,
  encodeIfNotEncoded,
  getBySuppliedId,
  head,
  Part,
  PartData,
  PartList,
  PartRevisionData,
  PartRevisionList,
  Polling,
  pollQueuedJob,
  prettyJson,
  RenderImageArgs,
  uploadFileIfNotExists,
  VertexClient,
} from '../..';

/**
 * Create parts from file arguments.
 */
interface CreatePartFromFileArgs {
  readonly client: VertexClient;
  readonly createFileReq: CreateFileRequest;
  readonly createPartReq: (fileId: string) => CreatePartRequest;
  readonly fileData: unknown; // Use Buffer in Node
  readonly polling?: Polling;
  readonly verbose: boolean;
}

/**
 * Get part revision by supplied ID arguments.
 */
interface GetPartRevisionBySuppliedIdArgs {
  readonly client: VertexClient;
  readonly suppliedPartId: string;
  readonly suppliedRevisionId: string;
}

/**
 * Create part and file resources if they don't already exist.
 *
 * @param client - The {@link VertexClient}.
 * @param createFileReq - The {@link CreateFileRequest}.
 * @param createPartReq - A function returning a {@link CreatePartRequest}.
 * @param fileData - The file data, a `Buffer` in Node.
 * @param polling - The {@link Polling} configuration.
 * @param verbose - Whether to print verbose log messages.
 * @returns The {@link PartRevisionData}.
 */
export async function createPartFromFileIfNotExists({
  client,
  createFileReq,
  createPartReq,
  fileData,
  polling,
  verbose,
}: CreatePartFromFileArgs): Promise<PartRevisionData> {
  const file = await uploadFileIfNotExists({
    client,
    verbose,
    fileData,
    createFileReq,
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
    });
    if (existingPartRev) {
      if (verbose) {
        console.log(
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
    console.log(
      `Created part with queued-translation ${queuedId}, file ${file.id}`
    );

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

  if (verbose) console.log(`Created part-revision ${partRev.id}`);

  return partRev;
}

/**
 * Get a part revision by supplied ID.
 *
 * @param client - The {@link VertexClient}.
 * @param suppliedPartId - The supplied part ID.
 * @param suppliedRevisionId - A supplied revision ID.
 * @returns The {@link PartRevisionData}.
 */
export async function getPartRevisionBySuppliedId({
  client,
  suppliedPartId,
  suppliedRevisionId,
}: GetPartRevisionBySuppliedIdArgs): Promise<PartRevisionData | undefined> {
  // TODO: Update once filtering by part and part-revision suppliedIds supported
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
export async function renderPartRevision<T>(
  args: RenderImageArgs
): Promise<AxiosResponse<T>> {
  return await args.client.partRevisions.renderPartRevision(
    {
      id: args.renderReq.id,
      height: args.renderReq.height,
      width: args.renderReq.width,
    },
    { responseType: 'stream' }
  );
}
