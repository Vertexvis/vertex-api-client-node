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
  const suppliedId = args.createFileReq.data.attributes.suppliedId;
  const fileName = suppliedId || args.createFileReq.data.attributes.name;

  if (suppliedId) {
    const getFilesRes = await args.client.files.getFiles(undefined, 1, [
      suppliedId,
    ]);
    throwOnError(
      getFilesRes,
      `Error getting files by suppliedId '${fileName}'`
    );

    if (getFilesRes.data.data.length > 0) {
      const file = getFilesRes.data.data[0];
      const fileId = file.data.id;
      if (file.data.attributes.status === 'complete') {
        if (args.verbose) {
          console.log(
            `File with suppliedId '${fileName}' already exists, using it, ${fileId}`
          );
        }

        return fileId;
      } else {
        // TODO: Temporary until we can resume file uploads
        if (args.verbose) {
          console.log(
            `Deleting file '${fileName}' in status ${file.data.attributes.status}, ${fileId}`
          );
        }

        await args.client.files.deleteFile(fileId);
        throwOnError(
          getFilesRes,
          `Error deleting file by suppliedId '${fileName}'`
        );
      }
    }
  }

  const fileId = await uploadFile(args);
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
