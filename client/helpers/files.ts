import {
  CreateFileRequest,
  encodeIfNotEncoded,
  FileMetadataData,
  FileList,
  getBySuppliedId,
  getPage,
  VertexClient,
} from '../..';

interface UploadFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Buffer in Node
  createFileReq: CreateFileRequest;
}

interface DeleteArgs {
  client: VertexClient;
  pageSize?: number;
  verbose?: boolean;
}

export async function deleteAllFiles({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs) {
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.files.getFiles({ pageCursor: cursor, pageSize })
    );
    cursor = res.cursor;
    await Promise.all(
      res.page.data.map((p) => client.files.deleteFile({ id: p.id }))
    );
    if (verbose) console.log(`Deleted ${res.page.data.length} file(s)`);
  } while (cursor);
}

export async function uploadFileIfNotExists(
  args: UploadFileArgs
): Promise<FileMetadataData> {
  const suppliedId = args.createFileReq.data.attributes.suppliedId;
  const existingFile = suppliedId
    ? await getBySuppliedId<FileMetadataData, FileList>(
        () =>
          args.client.files.getFiles({
            pageSize: 1,
            filterSuppliedId: encodeIfNotEncoded(suppliedId),
          }),
        suppliedId
      )
    : undefined;

  if (existingFile) {
    const fileId = existingFile.id;
    if (existingFile.attributes.status === 'complete') {
      if (args.verbose) {
        console.log(
          `File with suppliedId '${suppliedId}' already exists, using it, ${fileId}`
        );
      }

      return existingFile;
    } else {
      // TODO: Temporary until we can resume file uploads
      if (args.verbose) {
        console.log(
          `Deleting file with suppliedId '${suppliedId}' in status ${existingFile.attributes.status}, ${fileId}`
        );
      }

      await args.client.files.deleteFile({ id: fileId });
    }
  }

  return await uploadFile(args);
}

export async function uploadFile(
  args: UploadFileArgs
): Promise<FileMetadataData> {
  const fileName = args.createFileReq.data.attributes.name;
  const createRes = await args.client.files.createFile({
    createFileRequest: args.createFileReq,
  });

  const file = createRes.data.data;
  const fileId = file.id;
  if (args.verbose) console.log(`Created file '${fileName}', ${fileId}`);

  await args.client.files.uploadFile({ id: fileId, body: args.fileData });

  if (args.verbose) console.log(`Uploaded file ${fileId}`);

  return file;
}
