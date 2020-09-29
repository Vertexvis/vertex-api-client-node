import { CreateFileRequest, CreatePartRequest } from '../..';
import { pollQueuedJob, throwOnError, VertexClient } from '..';
import { uploadFileIfNotExists } from './files';

interface CreatePartFromFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Use Buffer in Node
  createFileReq: CreateFileRequest;
  createPartReq: (fileId: string) => CreatePartRequest;
}

export const createPartFromFile = async (
  args: CreatePartFromFileArgs
): Promise<string> => {
  const fileId = await uploadFileIfNotExists({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  // TODO: Temporary until race condition fixed
  await sleep(500);

  const req = args.createPartReq(fileId);
  const createPartRes = await args.client.parts.createPart(req);
  throwOnError(createPartRes, `Error creating part for file ${fileId}`);

  const queuedId = createPartRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created part with queued-translation ${queuedId}, file ${fileId}`
    );

  const partRevisionId = (
    await pollQueuedJob(queuedId, (id) =>
      args.client.translationInspections.getQueuedTranslation(id)
    )
  ).data.id;

  return partRevisionId;
};

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
