import { AxiosResponse } from 'axios';
import pLimit from 'p-limit';
import {
  CameraFitTypeEnum,
  CreateSceneItemRequest,
  CreateSceneRequest,
  getPage,
  MaxAttempts,
  Polling,
  PollIntervalMs,
  pollQueuedJob,
  QueuedJob,
  RenderImageArgs,
  Scene,
  SceneData,
  SceneItem,
  SceneRelationshipDataTypeEnum,
  UpdateSceneRequestDataAttributesStateEnum,
  VertexClient,
} from '../..';

interface CreateSceneWithSceneItemsArgs {
  client: VertexClient;
  parallelism: number;
  verbose: boolean;
  createSceneReq: () => CreateSceneRequest;
  createSceneItemReqs: CreateSceneItemRequest[];
  polling?: Polling;
}

interface PollSceneReadyArgs {
  client: VertexClient;
  id: string;
  polling?: Polling;
}

interface DeleteArgs {
  client: VertexClient;
  pageSize?: number;
  verbose?: boolean;
}

export async function createSceneWithSceneItems(
  args: CreateSceneWithSceneItemsArgs
): Promise<SceneData> {
  const createSceneRes = await args.client.scenes.createScene({
    createSceneRequest: {
      data: {
        attributes: {},
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });
  const sceneId = createSceneRes.data.data.id;
  if (args.verbose) {
    console.log(`Created scene ${sceneId}`);
    console.log(
      `Creating ${args.createSceneItemReqs.length} queued-scene-items...`
    );
  }

  const limit = pLimit(args.parallelism);
  const responses = await Promise.all(
    args.createSceneItemReqs.map((r) =>
      limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
        (r: CreateSceneItemRequest) =>
          args.client.sceneItems.createSceneItem({
            id: sceneId,
            createSceneItemRequest: r,
          }),
        r
      )
    )
  );

  if (args.verbose)
    console.log(`Created queued-scene-items. Polling for completion...`);

  await pollQueuedJob<SceneItem>({
    id: responses[responses.length - 1].data.data.id,
    getQueuedJob: (id) => args.client.sceneItems.getQueuedSceneItem({ id }),
    allow404: true,
    polling: args.polling,
  });

  if (args.verbose) console.log(`Committing scene and polling until ready...`);

  await args.client.scenes.updateScene({
    id: sceneId,
    updateSceneRequest: {
      data: {
        attributes: {
          state: UpdateSceneRequestDataAttributesStateEnum.Commit,
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });
  await pollSceneReady({
    client: args.client,
    id: sceneId,
    polling: args.polling,
  });

  if (args.verbose) console.log(`Fitting scene's camera to scene-items...`);

  const scene = await args.client.scenes.updateScene({
    id: sceneId,
    updateSceneRequest: {
      data: {
        attributes: {
          camera: { type: CameraFitTypeEnum.FitVisibleSceneItems },
        },
        type: SceneRelationshipDataTypeEnum.Scene,
      },
    },
  });

  return scene.data.data;
}

export async function deleteAllScenes({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs) {
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const sceneIds = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(sceneIds.map((id) => client.scenes.deleteScene({ id })));
    if (verbose) console.log(`Deleting scene(s) ${sceneIds.join(', ')}`);
    process.exit(0);
  } while (cursor);
}

export async function renderScene<T>(
  args: RenderImageArgs
): Promise<AxiosResponse<T>> {
  return await args.client.scenes.renderScene(
    {
      id: args.renderReq.id,
      height: args.renderReq.height,
      width: args.renderReq.width,
    },
    { responseType: 'stream' }
  );
}

export async function pollSceneReady({
  client,
  id,
  polling = {
    intervalMs: PollIntervalMs,
    maxAttempts: MaxAttempts,
  },
}: PollSceneReadyArgs): Promise<Scene> {
  const poll = async (): Promise<Scene> =>
    new Promise((resolve) => {
      setTimeout(
        async () => resolve((await client.scenes.getScene({ id })).data),
        polling.intervalMs
      );
    });

  let attempts = 1;
  let scene = await poll();
  while (scene.data.attributes.state !== 'ready') {
    attempts++;
    if (attempts > polling.maxAttempts)
      throw new Error(
        `Polled scene ${id} ${polling.maxAttempts} times, giving up.`
      );
    scene = await poll();
  }

  return scene;
}
