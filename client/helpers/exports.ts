import { CreateExportRequest, Export } from '../../index';
import {
  BaseReq,
  isPollError,
  MaxAttempts,
  PollIntervalMs,
  pollQueuedJob,
  throwOnError,
} from '../index';

/**
 * Create export arguments.
 */
export interface CreateExportReq extends BaseReq {
  /** Function returning a {@link CreateExportRequest}. */
  readonly createExportReq: () => CreateExportRequest;
}

/**
 * Create an export.
 *
 * @param args - The {@link CreateExportReq}.
 */
export async function createExport({
  client,
  createExportReq,
  onMsg = console.log,
  verbose,
}: CreateExportReq): Promise<Export> {
  const res = await client.exports.createExport({
    createExportRequest: createExportReq(),
  });
  const queuedId = res.data.data.id;
  if (verbose) onMsg(`Created export with queued-export ${queuedId}`);

  const pollRes = await pollQueuedJob<Export>({
    id: queuedId,
    getQueuedJob: (id) => client.exports.getQueuedExport({ id }),
    polling: { intervalMs: PollIntervalMs, maxAttempts: MaxAttempts },
  });
  if (isPollError(pollRes.res)) throwOnError(pollRes);
  if (verbose) onMsg(`Completed export ${pollRes.res.data.id}`);

  return pollRes.res;
}
