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
  exceptions = new Set(),
}: DeleteArgs): Promise<FileMetadataData[]> {
  let files: FileMetadataData[] = [];
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.files.getFiles({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
    await Promise.all(ids.map((id) => client.files.deleteFile({ id })));
    files = files.concat(res.page.data);
  } while (cursor);

  return files;
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
  onMsg = console.log,
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
        onMsg(
          `File with suppliedId '${suppliedId}' already exists, using it, ${fileId}`
        );
      }

      return existingFile;
    } else {
      if (verbose) {
        onMsg(
          `Deleting file with suppliedId '${suppliedId}' in status ${existingFile.attributes.status}, ${fileId}`
        );
      }

      await client.files.deleteFile({ id: fileId });
    }
  }

  return await uploadFile({ client, createFileReq, fileData, onMsg, verbose });
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
  onMsg = console.log,
  verbose,
}: UploadFileArgs): Promise<FileMetadataData> {
  const fileName = createFileReq.data.attributes.name;
  const createRes = await client.files.createFile({
    createFileRequest: createFileReq,
  });
  const fileId = createRes.data.data.id;
  if (verbose) onMsg(`Created file '${fileName}', ${fileId}`);

  await client.files.uploadFile({ id: fileId, body: fileData });
  if (verbose) onMsg(`Uploaded file ${fileId}`);

  const updated = (await client.files.getFile({ id: fileId })).data.data;
  const status = updated.attributes.status;
  if (status === 'error')
    throw new Error(`Uploading file ${fileId} failed with status ${status}`);

  // TODO: Temporary, remove if we don't see this logged
  if (status !== 'complete') {
    if (verbose) onMsg(`File ${fileId} in status ${status}, waiting...`);
    await delay(1000);
  }

  return updated;
}
