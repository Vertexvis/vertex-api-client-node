import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

import {
  AccountsApi,
  ApplicationsApi,
  BatchesApi,
  CollaborationContextsApi,
  Configuration,
  ExportsApi,
  FilesApi,
  GeometrySetsApi,
  HitsApi,
  Oauth2Api,
  OAuth2Token,
  PartRevisionsApi,
  PartsApi,
  SceneAlterationsApi,
  SceneAnnotationsApi,
  SceneItemOverridesApi,
  SceneItemsApi,
  ScenesApi,
  SceneViewsApi,
  SceneViewStatesApi,
  StreamKeysApi,
  TranslationInspectionsApi,
  UsersApi,
  WebhookSubscriptionsApi,
} from '../index';
import {
  BasePath,
  createToken,
  isFailure,
  nowEpochMs,
  prettyJson,
} from './index';
import { version } from './version';

/**
 * Static `build` function arguments.
 */
export interface BuildReq {
  /**
   * A {@link AxiosRequestConfig}. For example, to use HTTP keep-alive,
   *
   *  * @example
   * ```typescript
   * import { Agent } from 'https';from '@vertexvis/api-client-node';
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

  /** Your Vertex API client ID and secret. */
  readonly client?: {
    readonly id?: string;
    readonly secret?: string;
  };

  readonly initialToken?: OAuth2Token;
}

/**
 * {@link VertexClient} constructor arguments.
 */
interface CtorReq {
  readonly auth: Oauth2Api;
  readonly axiosInst: AxiosInstance;
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
 * } from '@vertexvis/api-client-node';
 *
 * const main = async () => {
 *   try {
 *     // Shown with default values
 *     const client = await VertexClient.build({
 *       basePath: 'https://platform.vertexvis.com',
 *       client: {
 *         id: process.env.VERTEX_CLIENT_ID,
 *         secret: process.env.VERTEX_CLIENT_SECRET,
 *       },
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
 * @see {@link https://developer.vertexvis.com/docs/guides|Developer Guides} to get started.
 */
export class VertexClient {
  public accounts: AccountsApi;
  public applications: ApplicationsApi;
  public batches: BatchesApi;
  public collaborationContexts: CollaborationContextsApi;
  public exports: ExportsApi;
  public files: FilesApi;
  public geometrySets: GeometrySetsApi;
  public hits: HitsApi;
  public oAuth2: Oauth2Api;
  public partRevisions: PartRevisionsApi;
  public parts: PartsApi;
  public sceneAlterations: SceneAlterationsApi;
  public sceneAnnotations: SceneAnnotationsApi;
  public sceneItemOverrides: SceneItemOverridesApi;
  public sceneItems: SceneItemsApi;
  public scenes: ScenesApi;
  public sceneViews: SceneViewsApi;
  public sceneViewStates: SceneViewStatesApi;
  public streamKeys: StreamKeysApi;
  public translationInspections: TranslationInspectionsApi;
  public users: UsersApi;
  public webhookSubscriptions: WebhookSubscriptionsApi;

  public axiosInstance: AxiosInstance;
  public config: Configuration;
  public token: OAuth2Token;

  private tokenFetchedEpochMs: number;

  private constructor({ auth, axiosInst, basePath, token }: CtorReq) {
    this.oAuth2 = auth;
    this.token = token;
    this.tokenFetchedEpochMs = nowEpochMs();
    this.config = new Configuration({
      accessToken: this.accessTokenRefresher,
      basePath,
    });
    this.axiosInstance = axiosInst;
    this.accounts = new AccountsApi(this.config, undefined, axiosInst);
    this.applications = new ApplicationsApi(this.config, undefined, axiosInst);
    this.batches = new BatchesApi(this.config, undefined, axiosInst);
    this.collaborationContexts = new CollaborationContextsApi(
      this.config,
      undefined,
      axiosInst
    );
    this.exports = new ExportsApi(this.config, undefined, axiosInst);
    this.files = new FilesApi(this.config, undefined, axiosInst);
    this.geometrySets = new GeometrySetsApi(this.config, undefined, axiosInst);
    this.hits = new HitsApi(this.config, undefined, axiosInst);
    this.partRevisions = new PartRevisionsApi(
      this.config,
      undefined,
      axiosInst
    );
    this.parts = new PartsApi(this.config, undefined, axiosInst);
    this.sceneAlterations = new SceneAlterationsApi(
      this.config,
      undefined,
      axiosInst
    );
    this.sceneAnnotations = new SceneAnnotationsApi(
      this.config,
      undefined,
      axiosInst
    );
    this.sceneItemOverrides = new SceneItemOverridesApi(
      this.config,
      undefined,
      axiosInst
    );
    this.sceneItems = new SceneItemsApi(this.config, undefined, axiosInst);
    this.scenes = new ScenesApi(this.config, undefined, axiosInst);
    this.sceneViews = new SceneViewsApi(this.config, undefined, axiosInst);
    this.sceneViewStates = new SceneViewStatesApi(
      this.config,
      undefined,
      axiosInst
    );
    this.streamKeys = new StreamKeysApi(this.config, undefined, axiosInst);
    this.translationInspections = new TranslationInspectionsApi(
      this.config,
      undefined,
      axiosInst
    );
    this.users = new UsersApi(this.config, undefined, axiosInst);
    this.webhookSubscriptions = new WebhookSubscriptionsApi(
      this.config,
      undefined,
      axiosInst
    );
  }

  /**
   * Build a VertexClient.
   *
   * @param args - {@link BuildReq}.
   */
  public static build = async (args?: BuildReq): Promise<VertexClient> => {
    if (typeof window !== 'undefined') {
      throw new Error(
        '@vertexvis/api-client-node is not supported in browser environments. ' +
          'For details on how your application should communicate with the ' +
          'Vertex platform, visit https://developer.vertexvis.com/docs/guides/platform-architecture.'
      );
    }

    const basePath = args?.basePath
      ? args?.basePath.endsWith('/')
        ? args?.basePath.slice(0, -1)
        : args?.basePath
      : `https://platform.vertexvis.com`;
    const axiosInst = axios.create({
      headers: { 'user-agent': `vertex-api-client-node/${version}` },
      ...createAxiosOptions(args?.axiosOptions),
    });

    axiosInst.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.isAxiosError && error?.response?.config) {
          const r = error.response;
          const c = r.config;
          const m = c.method ? c.method.toUpperCase() : 'undefined';
          const octetStream =
            c.headers['Content-Type'] === 'application/octet-stream';
          if (isFailure(r.data)) {
            error.vertexError = {
              method: m,
              req: octetStream ? undefined : c.data,
              res: r.data,
              status: r.status,
              url: c.url,
            };
          }
          error.vertexErrorMessage = `${m} '${c.url}' error.\n${
            c.data && !octetStream ? `Req: ${c.data}\n` : ''
          }Res: ${prettyJson(r.data)}`;
        }
        return Promise.reject(error);
      }
    );

    const auth = new Oauth2Api(
      new Configuration({
        basePath,
        username: args?.client?.id ?? process?.env?.VERTEX_CLIENT_ID,
        password: args?.client?.secret ?? process?.env?.VERTEX_CLIENT_SECRET,
      }),
      basePath,
      axiosInst
    );

    const token = args?.initialToken || (await createToken(auth));

    return new VertexClient({ auth, axiosInst, basePath, token });
  };

  private accessTokenRefresher = async (): Promise<string> => {
    const nowMs = nowEpochMs();
    const expiresAtMs =
      this.tokenFetchedEpochMs + this.token.expires_in * SecToMs;
    const tokenValid = nowMs + TenMinsInMs < expiresAtMs;
    if (tokenValid) return this.token.access_token;

    console.log('Refreshing access token');
    this.token = await createToken(this.oAuth2);
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
