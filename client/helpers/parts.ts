import {
  CreateFileRequest,
  CreatePartRequest,
  delay,
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
  verbose: boolean;
  fileData: unknown; // Use Buffer in Node
  createFileReq: CreateFileRequest;
  createPartReq: (fileId: string) => CreatePartRequest;
  polling?: Polling;
}

interface GetPartRevisionBySuppliedIdArgs {
  client: VertexClient;
  suppliedPartId: string;
  suppliedRevisionId: string;
}

export async function createPartFromFileIfNotExists(
  args: CreatePartFromFileArgs
): Promise<PartRevisionData> {
  const file = await uploadFileIfNotExists({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  // TODO: Temporary until race condition fixed
  await delay(1000);

  const createPartRequest = args.createPartReq(file.id);
  const suppliedPartId = createPartRequest.data.attributes.suppliedId;
  const suppliedRevisionId =
    createPartRequest.data.attributes.suppliedRevisionId;

  if (suppliedPartId && suppliedRevisionId) {
    const existingPartRev = await getPartRevisionBySuppliedId({
      client: args.client,
      suppliedPartId,
      suppliedRevisionId,
    });
    if (existingPartRev) {
      if (args.verbose) {
        console.log(
          `part-revision with suppliedId '${suppliedPartId}' and suppliedRevisionId ` +
            `'${suppliedRevisionId}' already exists, using it, ${existingPartRev.id}`
        );
      }
      return existingPartRev;
    }
  }

  const createPartRes = await args.client.parts.createPart({
    createPartRequest,
  });
  const queuedId = createPartRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created part with queued-translation ${queuedId}, file ${file.id}`
    );

  const part = await pollQueuedJob<Part>({
    id: queuedId,
    getQueuedJob: (id) =>
      args.client.translationInspections.getQueuedTranslation({ id }),
    polling: args.polling,
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

  if (args.verbose) console.log(`Created part-revision ${partRev.id}`);

  return partRev;
}

export async function getPartRevisionBySuppliedId(
  args: GetPartRevisionBySuppliedIdArgs
): Promise<PartRevisionData | undefined> {
  // TODO: Update once we can filter by both part and part-revision suppliedIds with one API call
  const existingPart = await getBySuppliedId<PartData, PartList>(
    () =>
      args.client.parts.getParts({
        pageSize: 1,
        filterSuppliedId: encodeIfNotEncoded(args.suppliedPartId),
      }),
    args.suppliedPartId
  );
  if (existingPart) {
    const existingPartRev = await getBySuppliedId<
      PartRevisionData,
      PartRevisionList
    >(
      () =>
        args.client.partRevisions.getPartRevisions({
          id: existingPart.id,
          pageSize: 1,
          filterSuppliedId: encodeIfNotEncoded(args.suppliedRevisionId),
        }),
      args.suppliedRevisionId
    );
    if (existingPartRev) return existingPartRev;
  }

  return undefined;
}
