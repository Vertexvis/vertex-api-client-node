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

/**
 * Create scene with scene items arguments.
 */
interface CreateSceneWithSceneItemsArgs {
  readonly client: VertexClient;
  readonly parallelism: number;
  readonly verbose: boolean;
  readonly createSceneReq: () => CreateSceneRequest;
  readonly createSceneItemReqs: CreateSceneItemRequest[];
  readonly polling?: Polling;
}

/**
 * Poll scene ready arguments.
 */
interface PollSceneReadyArgs {
  readonly client: VertexClient;
  readonly id: string;
  readonly polling?: Polling;
}

/**
 * Delete arguments.
 */
interface DeleteArgs {
  readonly client: VertexClient;
  readonly pageSize?: number;
  readonly verbose?: boolean;
}

/**
 * Create a scene with scene items.
 *
 * @param args - The {@link CreateSceneWithSceneItemsArgs}.
 * @returns The {@link SceneData}
 */
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
    args.createSceneItemReqs.map((req) =>
      limit<CreateSceneItemRequest[], AxiosResponse<QueuedJob>>(
        (r: CreateSceneItemRequest) =>
          args.client.sceneItems.createSceneItem({
            id: sceneId,
            createSceneItemRequest: r,
          }),
        req
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

/**
 * Delete all scenes.
 *
 * @param args - The {@link DeleteArgs}.
 */
export async function deleteAllScenes({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs): Promise<void> {
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.scenes.getScenes({ pageCursor: cursor, pageSize })
    );
    const sceneIds = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(sceneIds.map((id) => client.scenes.deleteScene({ id })));
    if (verbose) console.log(`Deleting scene(s) ${sceneIds.join(', ')}`);
  } while (cursor);
}

/**
 * Poll a scene until it reaches the ready state.
 *
 * @param args - The {@link PollSceneReadyArgs}.
 * @returns The {@link Scene}
 */
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

/**
 * Render a scene.
 *
 * @param args - The {@link RenderImageArgs}.
 */
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
