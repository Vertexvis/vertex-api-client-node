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
  uploadFileIfNotExists,
  VertexClient,
} from '../..';

interface CreatePartFromFileArgs {
  client: VertexClient;
  createFileReq: CreateFileRequest;
  createPartReq: (fileId: string) => CreatePartRequest;
  fileData: unknown; // Use Buffer in Node
  polling?: Polling;
  verbose: boolean;
}

interface GetPartRevisionBySuppliedIdArgs {
  client: VertexClient;
  suppliedPartId: string;
  suppliedRevisionId: string;
}

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
