import {
  BaseReq,
  delay,
  DeleteReq,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
} from '../../client/index';
import { CreateFileRequest, FileList, FileMetadataData } from '../../index';

/** Upload file arguments. */
export interface UploadFileReq extends BaseReq {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  readonly file?: {
    readonly data: Buffer;
    readonly size: number;
  };

  /** File data, use {@link Buffer} in Node.
   * @deprecated Use {@link file} instead.
   */
  readonly fileData?: unknown;
}

/**
 * Delete all files.
 *
 * @param args - The {@link DeleteReq}.
 */
export async function deleteAllFiles({
  client,
  pageSize = 100,
  exceptions = new Set(),
}: DeleteReq): Promise<FileMetadataData[]> {
  let files: FileMetadataData[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await getPage(() =>
      client.files.getFiles({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data
      .map((d) => d.id)
      .filter((id) => !exceptions.has(id));
    cursor = res.cursor;
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(ids.map((id) => client.files.deleteFile({ id })));
    files = files.concat(res.page.data);
  } while (cursor);

  return files;
}

/**
 * Create a file resource and upload a file if it doesn't already exist.
 *
 * @param args - The {@link UploadFileReq}.
 */
export async function uploadFileIfNotExists({
  client,
  createFileReq,
  file,
  fileData,
  onMsg = console.log,
  verbose,
}: UploadFileReq): Promise<FileMetadataData> {
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

  return uploadFile({ client, createFileReq, file, fileData, onMsg, verbose });
}

/**
 * Create a file resource and upload a file.
 *
 * @param args - The {@link UploadFileReq}.
 */
export async function uploadFile({
  client,
  createFileReq,
  file,
  fileData,
  onMsg = console.log,
  verbose,
}: UploadFileReq): Promise<FileMetadataData> {
  const fileName = createFileReq.data.attributes.name;
  const createRes = await client.files.createFile({
    createFileRequest: createFileReq,
  });
  const fileId = createRes.data.data.id;
  if (verbose) onMsg(`Created file '${fileName}', ${fileId}`);

  await client.files.uploadFile(
    { id: fileId, body: file?.data ?? fileData },
    { headers: file?.size ? { 'Content-Length': file.size } : undefined }
  );
  if (verbose) onMsg(`Uploaded file ${fileId}`);

  const updated = (await client.files.getFile({ id: fileId })).data.data;
  if (file?.size && updated.attributes.size !== file.size) {
    onMsg(
      `File size mismatch, expected ${file.size} got ${updated.attributes.size}`
    );
  }

  const status = updated.attributes.status;
  if (status === 'error')
    throw new Error(`Uploading file ${fileId} failed with status ${status}`);

  // Sanity check
  if (status !== 'complete') {
    if (verbose) onMsg(`File ${fileId} in status ${status}, waiting...`);
    await delay(1000);
  }

  return updated;
}
