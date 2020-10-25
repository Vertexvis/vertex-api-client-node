import {
  CreateFileRequest,
  FileMetadata,
  FileList,
  getBySuppliedId,
  VertexClient,
} from '../..';

interface UploadFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Buffer in Node
  createFileReq: CreateFileRequest;
}

export async function uploadFileIfNotExists(
  args: UploadFileArgs
): Promise<string> {
  const suppliedId = args.createFileReq.data.attributes.suppliedId;
  const existingFile = await getBySuppliedId<FileMetadata, FileList>(
    () => args.client.files.getFiles(undefined, 1, [suppliedId]),
    suppliedId
  );

  if (existingFile) {
    const fileId = existingFile.data.id;
    if (existingFile.data.attributes.status === 'complete') {
      if (args.verbose) {
        console.log(
          `File with suppliedId '${suppliedId}' already exists, using it, ${fileId}`
        );
      }

      return fileId;
    } else {
      // TODO: Temporary until we can resume file uploads
      if (args.verbose) {
        console.log(
          `Deleting file with suppliedId '${suppliedId}' in status ${existingFile.data.attributes.status}, ${fileId}`
        );
      }

      await args.client.files.deleteFile(fileId);
    }
  }

  return await uploadFile(args);
}

export async function uploadFile(args: UploadFileArgs): Promise<string> {
  const fileName = args.createFileReq.data.attributes.name;
  const createRes = await args.client.files.createFile(args.createFileReq);

  const fileId = createRes.data.data.id;
  if (args.verbose) console.log(`Created file '${fileName}', ${fileId}`);

  await args.client.files.uploadFile(fileId, args.fileData);

  if (args.verbose) console.log(`Uploaded file ${fileId}`);

  return fileId;
}
