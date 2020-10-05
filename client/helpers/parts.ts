import { Async } from '@vertexvis/utils';
import { pollQueuedJob, throwOnError, VertexClient } from '..';
import { CreateFileRequest, CreatePartRequest } from '../..';
import { uploadFileIfNotExists } from './files';

interface CreatePartFromFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Use Buffer in Node
  createFileReq: CreateFileRequest;
  createPartReq: (fileId: string) => CreatePartRequest;
}

export const createPartFromFileIfNotExists = async (
  args: CreatePartFromFileArgs
): Promise<string> => {
  const fileId = await uploadFileIfNotExists({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  // TODO: Temporary until race condition fixed
  await Async.delay(1000);

  const req = args.createPartReq(fileId);
  const suppliedId = req.data.attributes.suppliedId;
  const suppliedRevisionId = req.data.attributes.suppliedRevisionId;

  // TODO: Update once we can filter by both part and part-revision suppliedIds with one API call
  const getPartRes = await args.client.parts.getParts(undefined, 1, [
    suppliedId,
  ]);
  throwOnError(getPartRes, `Error getting parts by suppliedId '${suppliedId}'`);

  if (getPartRes.data.data.length > 0) {
    const part = getPartRes.data.data[0];
    const getPartRevRes = await args.client.partRevisions.getPartRevisions(
      part.data.id,
      [suppliedRevisionId]
    );
    throwOnError(
      getPartRevRes,
      `Error getting part-revisions by suppliedId '${suppliedRevisionId}'`
    );

    if (getPartRevRes.data.data.length > 0) {
      const partRevId = getPartRevRes.data.data[0].data.id;
      if (args.verbose) {
        console.log(
          `Part with suppliedId '${suppliedId}' and suppliedRevisionId '${suppliedRevisionId}' already exists, using it, ${partRevId}`
        );
      }

      return partRevId;
    }
  }

  const createPartRes = await args.client.parts.createPart(req);
  throwOnError(createPartRes, `Error creating part for file ${fileId}`);

  const queuedId = createPartRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created part with queued-translation ${queuedId}, file ${fileId}`
    );

  const partRevId = (
    await pollQueuedJob(queuedId, (id) =>
      args.client.translationInspections.getQueuedTranslation(id)
    )
  ).data.id;

  if (args.verbose) console.log(`Created part-revision ${partRevId}`);
  return partRevId;
};
