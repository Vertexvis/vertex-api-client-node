import { RenderRequest, VertexClient } from '..';

export * from './files';
export * from './parts';
export * from './scenes';
export * from './scene-items';
export * from './scene-views';

/*
  `renderScene` and `renderSceneView` return Streams in Node. Example awaiting file creation,

  async function main() {
    const imgStream = await renderScene<NodeJS.ReadableStream>(...);
    await createFile(imgStream.data, imgPath);
  }

  async function createFile(
    stream: NodeJS.ReadableStream,
    path: string
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const ws = createWriteStream(path);
      stream.pipe(ws);
      ws.on('finish', resolve);
    });
  }
*/
export interface RenderImageArgs {
  client: VertexClient;
  renderReq: RenderRequest;
}
