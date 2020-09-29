import { CreateFileRequest } from '../..';
import { throwOnError, VertexClient } from '..';

interface UploadFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Buffer in Node
  createFileReq: CreateFileRequest;
}

export const uploadFileIfNotExists = async (
  args: UploadFileArgs
): Promise<string> => {
  const fileSuppliedId = args.createFileReq.data.attributes.suppliedId;
  const fileName = fileSuppliedId || args.createFileReq.data.attributes.name;
  let fileId;

  if (fileSuppliedId) {
    const getFilesRes = await args.client.files.getFiles(undefined, 1, [
      fileSuppliedId,
    ]);
    throwOnError(getFilesRes, `Error getting file by suppliedId '${fileName}'`);

    if (getFilesRes.data.data.length > 0) {
      fileId = getFilesRes.data.data[0].data.id;
      console.log(
        `File with suppliedId '${fileName}' already exists, using it, ${fileId}`
      );
    }
  }

  if (!fileId) fileId = await uploadFile(args);

  return fileId;
};

export const uploadFile = async (args: UploadFileArgs): Promise<string> => {
  const fileName = args.createFileReq.data.attributes.name;
  const createRes = await args.client.files.createFile(args.createFileReq);
  throwOnError(createRes, `Error creating file ${fileName}`);

  const fileId = createRes.data.data.id;
  if (args.verbose) console.log(`Created file '${fileName}', ${fileId}`);

  const uploadRes = await args.client.files.uploadFile(fileId, args.fileData);
  throwOnError(uploadRes, `Error uploading file ${fileName}`);

  if (args.verbose) console.log(`Uploaded file ${fileId}`);

  return fileId;
};
