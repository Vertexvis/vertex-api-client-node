import { CreateFileRequest, FileMetadataData, FileList } from '../../index';
import {
  BaseArgs,
  DeleteArgs,
  delay,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
} from '../../client/index';

/** Upload file arguments. */
export interface UploadFileArgs extends BaseArgs {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  /** File data, use {@link Buffer} or {@link ReadStream} in Node. */
  readonly fileData: unknown;
}

/**
 * Delete all files.
 *
 * @param args - The {@link DeleteArgs}.
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
    const ids = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(ids.map((id) => client.files.deleteFile({ id })));
    if (verbose) console.log(`Deleted file(s) ${ids.join(', ')}`);
  } while (cursor);
}

/**
 * Create a file resource and upload a file if it doesn't already exist.
 *
 * @param args - The {@link UploadFileArgs}.
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
 * @param args - The {@link UploadFileArgs}.
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
