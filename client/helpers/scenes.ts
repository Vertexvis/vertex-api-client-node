import { AxiosResponse } from 'axios';
import {
  CreateFileRequest,
  CreateSceneItemRequest,
  CreateSceneRequest,
  CreateSceneTemplateRequest,
} from '../..';
import { uploadFile, VertexClient } from '..';
import { pollQueuedJob } from '../utils';
import { RenderImageArgs } from '.';

interface CreateSceneFromTemplateFileArgs {
  client: VertexClient;
  verbose: boolean;
  fileData: unknown; // Buffer in Node
  createFileReq: CreateFileRequest;
  createSceneReq: (templateId: string) => CreateSceneRequest;
  createSceneTemplateReq: (fileId: string) => CreateSceneTemplateRequest;
}

interface CreateSceneWithSceneItemsArgs {
  client: VertexClient;
  parallelism: number;
  verbose: boolean;
  createSceneReq: () => CreateSceneRequest;
  createSceneItemsReq: () => CreateSceneItemRequest[];
}

export const createSceneFromTemplateFile = async (
  args: CreateSceneFromTemplateFileArgs
): Promise<string> => {
  const fileId = await uploadFile({
    client: args.client,
    verbose: args.verbose,
    fileData: args.fileData,
    createFileReq: args.createFileReq,
  });

  const createTemplateReq = args.createSceneTemplateReq(fileId);
  const createTemplateRes = await args.client.sceneTemplates.createSceneTemplate(
    createTemplateReq
  );
  const queuedSceneTemplateId = createTemplateRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created scene-template with queued-scene-template ${queuedSceneTemplateId}, file ${fileId}`
    );

  const templateId = (
    await pollQueuedJob(queuedSceneTemplateId, (id) =>
      args.client.sceneTemplates.getQueuedSceneTemplate(id)
    )
  ).data.id;
  if (args.verbose) console.log(`Created scene-template ${templateId}`);

  const createSceneReq = args.createSceneReq(templateId);
  const createSceneRes = await args.client.scenes.createScene(createSceneReq);
  const queuedSceneId = createSceneRes.data.data.id;
  if (args.verbose)
    console.log(
      `Created scene with queued-scene id ${queuedSceneId}, scene-template ${templateId}`
    );

  const sceneId = (
    await pollQueuedJob(queuedSceneId, (id) =>
      args.client.scenes.getQueuedScene(id)
    )
  ).data.id;

  return sceneId;
};

// Returns Stream in Node, `(await renderScene(...)).data.pipe(createWriteStream('image.jpeg'))`
export const renderScene = async (
  args: RenderImageArgs
): Promise<AxiosResponse<any>> =>
  await args.client.scenes.renderScene(
    args.renderReq.id,
    args.renderReq.height,
    args.renderReq.width,
    { responseType: 'stream' }
  );
