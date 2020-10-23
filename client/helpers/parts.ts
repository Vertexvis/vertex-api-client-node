import { pollQueuedJob, VertexClient } from '..';
import { CreateFileRequest, CreatePartRequest, Part } from '../..';
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

  const req = args.createPartReq(fileId);
  const suppliedId = req.data.attributes.suppliedId;
  const suppliedRevisionId = req.data.attributes.suppliedRevisionId;

  // TODO: Update once we can filter by both part and part-revision suppliedIds with one API call
  const getPartRes = await args.client.parts.getParts(undefined, 1, [
    suppliedId,
  ]);

  if (getPartRes.data.data.length > 0) {
    const part = getPartRes.data.data[0];
    if (part.data.attributes.suppliedId === suppliedId) {
      const getPartRevRes = await args.client.partRevisions.getPartRevisions(
        part.data.id,
        [suppliedRevisionId]
      );

      if (getPartRevRes.data.data.length > 0) {
        const partRev = getPartRevRes.data.data[0];
        if (partRev.data.attributes.suppliedId === suppliedRevisionId) {
          if (args.verbose) {
            console.log(
              `part-revision with suppliedId '${suppliedId}' and suppliedRevisionId ` +
                `'${suppliedRevisionId}' already exists, using it, ${partRev.data.id}`
            );
          }

          return partRev.data.id;
        }
      }
    }
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
  const partRevId = partRevIds?.length ? partRevIds[0] : '';

  if (args.verbose)
    console.log(
      // TODO: Temporary until redirect to /parts is deployed everywhere
      `Created ${partRevId ? `part-revision ${partRevId}` : part.data.id}`
    );
  return partRevId;
};
