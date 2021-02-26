import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  Configuration,
  FilesApi,
  GeometrySetsApi,
  HitsApi,
  PartRevisionsApi,
  SceneAlterationsApi,
  SceneItemOverridesApi,
  SceneItemsApi,
  SceneViewsApi,
  SceneViewStatesApi,
  StreamKeysApi,
  Oauth2Api,
  OAuth2Token,
  PartsApi,
  ScenesApi,
  TranslationInspectionsApi,
} from '../index';
import { BasePath, createToken, nowEpochMs, prettyJson } from './index';
import { version } from './version';

/**
 * Static `build` function arguments.
 */
interface BuildArgs {
  /**
   * A {@link AxiosRequestConfig}. For example, to use HTTP keep-alive in Node,
   *
   *  * @example
   * ```typescript
   * import { Agent } from 'https';from '@vertexvis/vertex-api-client';
   *
   * const main = async () => {
   *   const client = await VertexClient.build({
   *     axiosOptions: { httpsAgent: new Agent({ keepAlive: true }) }
   *   });
   * };
   *
   * main();
   * ```
   *
   * @see {@link https://github.com/axios/axios#request-config|Axios request config} for details.
   */
  readonly axiosOptions?: AxiosRequestConfig;

  /** Base path to use, @see {@link BasePath}. */
  readonly basePath?: BasePath;

  /** Your Vertex API client ID. */
  readonly clientId?: string;

  /** Your Vertex API client secret. */
  readonly clientSecret?: string;
}

/**
 * {@link VertexClient} constructor arguments.
 */
interface CtorArgs {
  readonly auth: Oauth2Api;
  readonly axiosOptions?: AxiosRequestConfig;
  readonly basePath: string;
  readonly token: OAuth2Token;
}

const TenMinsInMs = 600_000;
const SecToMs = 1000;

/**
 * The official API client for Vertex's API.
 *
 * @example
 * ```typescript
 * import {
 *   logError,
 *   prettyJson,
 *   VertexClient,
 * } from '@vertexvis/vertex-api-client';
 *
 * const main = async () => {
 *   try {
 *     // Shown with default values
 *     const client = await VertexClient.build({
 *       clientId: process.env.VERTEX_CLIENT_ID,
 *       clientSecret: process.env.VERTEX_CLIENT_SECRET,
 *       basePath: 'https://platform.vertexvis.com',
 *     });
 *
 *     const getFilesRes = await client.files.getFiles({ pageSize: 1 });
 *
 *     console.log(prettyJson(getFilesRes.data));
 *   } catch (error) {
 *     logError(error, console.error);
 *   }
 * };
 *
 * main();
 * ```
 *
 * @see {@link https://developer.vertexvis.com/guides|Developer Guides} to get started.
 */
export class VertexClient {
  public files: FilesApi;
  public geometrySets: GeometrySetsApi;
  public hits: HitsApi;
  public partRevisions: PartRevisionsApi;
  public parts: PartsApi;
  public sceneAlterations: SceneAlterationsApi;
  public sceneItemOverrides: SceneItemOverridesApi;
  public sceneItems: SceneItemsApi;
  public scenes: ScenesApi;
  public sceneViews: SceneViewsApi;
  public sceneViewStates: SceneViewStatesApi;
  public streamKeys: StreamKeysApi;
  public translationInspections: TranslationInspectionsApi;

  public axiosInstance: AxiosInstance;
  public config: Configuration;

  private auth: Oauth2Api;
  private token: OAuth2Token;
  private tokenFetchedEpochMs: number;

  private constructor({ auth, axiosOptions, basePath, token }: CtorArgs) {
    this.auth = auth;
    this.token = token;
    this.tokenFetchedEpochMs = nowEpochMs();
    this.config = new Configuration({
      accessToken: this.accessTokenRefresher,
      basePath,
    });
    this.axiosInstance = axios.create({
      headers: { 'user-agent': `vertex-api-client-ts/${version}` },
      ...axiosOptions,
    });
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.isAxiosError && error?.response?.config) {
          const r = error.response;
          const c = r.config;
          const m = c.method ? c.method.toUpperCase() : 'undefined';
          const octetStream =
            c.headers['Content-Type'] === 'application/octet-stream';
          error.vertexErrorMessage = `${m} '${c.url}' error.\n${
            c.data && !octetStream ? `Req: ${c.data}\n` : ''
          }Res: ${prettyJson(r.data)}`;
        }
        return Promise.reject(error);
      }
    );
    this.files = new FilesApi(this.config, undefined, this.axiosInstance);
    this.geometrySets = new GeometrySetsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.hits = new HitsApi(this.config, undefined, this.axiosInstance);
    this.partRevisions = new PartRevisionsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.parts = new PartsApi(this.config, undefined, this.axiosInstance);
    this.sceneAlterations = new SceneAlterationsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.sceneItemOverrides = new SceneItemOverridesApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.sceneItems = new SceneItemsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.scenes = new ScenesApi(this.config, undefined, this.axiosInstance);
    this.sceneViews = new SceneViewsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.sceneViewStates = new SceneViewStatesApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.streamKeys = new StreamKeysApi(
      this.config,
      undefined,
      this.axiosInstance
    );
    this.translationInspections = new TranslationInspectionsApi(
      this.config,
      undefined,
      this.axiosInstance
    );
  }

  /**
   * Build a VertexClient.
   *
   * @param args - {@link BuildArgs}.
   * @returns A {@link VertexClient}.
   */
  public static build = async (args?: BuildArgs): Promise<VertexClient> => {
    const basePath = args?.basePath
      ? args?.basePath.endsWith('/')
        ? args?.basePath.slice(0, -1)
        : args?.basePath
      : `https://platform.vertexvis.com`;
    const auth = new Oauth2Api(
      new Configuration({
        basePath,
        username: args?.clientId ?? process?.env?.VERTEX_CLIENT_ID,
        password: args?.clientSecret ?? process?.env?.VERTEX_CLIENT_SECRET,
      })
    );

    const token = await createToken(auth);
    return new VertexClient({
      auth,
      axiosOptions: createAxiosOptions(args?.axiosOptions),
      basePath,
      token,
    });
  };

  private accessTokenRefresher = async (): Promise<string> => {
    const nowMs = nowEpochMs();
    const expiresAtMs =
      this.tokenFetchedEpochMs + this.token.expires_in * SecToMs;
    const tokenValid = nowMs + TenMinsInMs < expiresAtMs;
    if (tokenValid) return this.token.access_token;

    console.log('Refreshing access token');
    this.token = await createToken(this.auth);
    this.tokenFetchedEpochMs = nowEpochMs();
    return this.token.access_token;
  };
}

/**
 * Create Axios client options.
 *
 * @param args - {@link AxiosRequestConfig}.
 * @returns {@link AxiosRequestConfig} with defaults.
 */
function createAxiosOptions(args?: AxiosRequestConfig): AxiosRequestConfig {
  return {
    validateStatus: (status: number) => status < 400,
    maxContentLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
    maxBodyLength: Number.POSITIVE_INFINITY, // Rely on API's limit instead
    ...(args ?? {}),
  };
}
