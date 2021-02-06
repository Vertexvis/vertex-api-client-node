import {
  CreateFileRequest,
  delay,
  encodeIfNotEncoded,
  FileMetadataData,
  FileList,
  getBySuppliedId,
  getPage,
} from '../..';
import { BaseArgs } from '..';

/**
 * Upload file arguments.
 */
interface UploadFileArgs extends BaseArgs {
  readonly createFileReq: CreateFileRequest;
  readonly fileData: unknown; // Buffer in Node
}

/**
 * Delete arguments.
 */
interface DeleteArgs extends BaseArgs {
  readonly pageSize?: number;
}

/**
 * Delete all files.
 *
 * @param client - The {@link VertexClient}.
 * @param pageSize - The page size used while fetching files.
 * @param verbose - Whether to print verbose log messages.
 */
export async function deleteAllFiles({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs): Promise<void> {
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

/**
 * Create a file resource and upload a file if it doesn't already exist.
 *
 * @param client - The {@link VertexClient}.
 * @param createFileReq - The {@link CreateFileRequest}.
 * @param fileData - The file data, a `Buffer` in Node.
 * @param verbose - Whether to print verbose log messages.
 * @returns The {@link FileMetadataData}.
 */
export async function uploadFileIfNotExists({
  client,
  createFileReq,
  fileData,
  verbose,
}: UploadFileArgs): Promise<FileMetadataData> {
  const suppliedId = createFileReq.data.attributes.suppliedId;
  const existingFile = suppliedId
    ? await getBySuppliedId<FileMetadataData, FileList>(
        () =>
          client.files.getFiles({
            pageSize: 1,
            filterSuppliedId: encodeIfNotEncoded(suppliedId),
          }),
        suppliedId
      )
    : undefined;

  if (existingFile) {
    const fileId = existingFile.id;
    if (existingFile.attributes.status === 'complete') {
      if (verbose) {
        console.log(
          `File with suppliedId '${suppliedId}' already exists, using it, ${fileId}`
        );
      }

      return existingFile;
    } else {
      // TODO: Temporary until we can resume file uploads
      if (verbose) {
        console.log(
          `Deleting file with suppliedId '${suppliedId}' in status ${existingFile.attributes.status}, ${fileId}`
        );
      }

      await client.files.deleteFile({ id: fileId });
    }
  }

  return await uploadFile({ client, createFileReq, fileData, verbose });
}

/**
 * Create a file resource and upload a file.
 *
 * @param client - The {@link VertexClient}.
 * @param createFileReq - The {@link CreateFileRequest}.
 * @param fileData - The file data, a `Buffer` in Node.
 * @param verbose - Whether to print verbose log messages.
 * @returns The {@link FileMetadataData}.
 */
export async function uploadFile({
  client,
  createFileReq,
  fileData,
  verbose,
}: UploadFileArgs): Promise<FileMetadataData> {
  const fileName = createFileReq.data.attributes.name;
  const createRes = await client.files.createFile({
    createFileRequest: createFileReq,
  });
  const fileId = createRes.data.data.id;
  if (verbose) console.log(`Created file '${fileName}', ${fileId}`);

  await client.files.uploadFile({ id: fileId, body: fileData });
  if (verbose) console.log(`Uploaded file ${fileId}`);

  const updated = (await client.files.getFile({ id: fileId })).data.data;
  const status = updated.attributes.status;
  if (status === 'error')
    throw new Error(`Uploading file ${fileId} failed with status ${status}`);

  // TODO: Temporary, remove if we don't see this logged
  if (status !== 'complete') {
    console.log(`File ${fileId} in status ${status}, waiting...`);
    await delay(1000);
  }

  return updated;
}
