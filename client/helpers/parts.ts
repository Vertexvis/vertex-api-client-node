import { Async } from '@vertexvis/utils';
import {
  CreateFileRequest,
  CreatePartRequest,
  encodeIfNotEncoded,
  getBySuppliedId,
  head,
  Part,
  PartList,
  PartRevision,
  PartRevisionList,
  pollQueuedJob,
  uploadFileIfNotExists,
  VertexClient,
} from '../..';

interface CreatePartFromFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Use Buffer in Node
  createFileReq: CreateFileRequest;
  createPartReq: (fileId: string) => CreatePartRequest;
}

interface GetPartRevisionBySuppliedIdArgs {
  client: VertexClient;
  suppliedPartId: string;
  suppliedRevisionId: string;
}

export async function createPartFromFileIfNotExists(
  args: CreatePartFromFileArgs
): Promise<string> {
  const fileId = await uploadFileIfNotExists({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  // TODO: Temporary until race condition fixed
  await Async.delay(1000);

  const req = args.createPartReq(fileId);
  const suppliedPartId = req.data.attributes.suppliedId;
  const suppliedRevisionId = req.data.attributes.suppliedRevisionId;
  const existingPartRev = await getPartRevisionBySuppliedId({
    client: args.client,
    suppliedPartId,
    suppliedRevisionId,
  });
  if (existingPartRev) {
    if (args.verbose) {
      console.log(
        `part-revision with suppliedId '${suppliedPartId}' and suppliedRevisionId ` +
          `'${suppliedRevisionId}' already exists, using it, ${existingPartRev.data.id}`
      );
    }
    return existingPartRev.data.id;
  }

  const createPartRes = await args.client.parts.createPart(req);
  const queuedId = createPartRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created part with queued-translation ${queuedId}, file ${fileId}`
    );

  const part = await pollQueuedJob<Part>(queuedId, (id) =>
    args.client.translationInspections.getQueuedTranslation(id)
  );
  const partRevIds = part.included
    ?.filter((pr) => pr.data.attributes.suppliedId === suppliedRevisionId)
    .map((pr) => pr.data.id);
  const partRevId = partRevIds ? head(partRevIds) : '';

  if (args.verbose) console.log(`Created part-revision ${partRevId}`);
  return partRevId;
}

export async function getPartRevisionBySuppliedId(
  args: GetPartRevisionBySuppliedIdArgs
): Promise<PartRevision | undefined> {
  // TODO: Update once we can filter by both part and part-revision suppliedIds with one API call
  const existingPart = await getBySuppliedId<Part, PartList>(
    () =>
      args.client.parts.getParts(
        undefined,
        1,
        encodeIfNotEncoded(args.suppliedPartId)
      ),
    args.suppliedPartId
  );
  if (existingPart) {
    const existingPartRev = await getBySuppliedId<
      PartRevision,
      PartRevisionList
    >(
      () =>
        args.client.partRevisions.getPartRevisions(
          existingPart.data.id,
          undefined,
          undefined,
          encodeIfNotEncoded(args.suppliedRevisionId)
        ),
      args.suppliedRevisionId
    );
    if (existingPartRev) return existingPartRev;
  }
}
