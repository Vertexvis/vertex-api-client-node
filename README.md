# Vertex API Client for Node.js

[![Version](https://img.shields.io/npm/v/@vertexvis/vertex-api-client.svg)](https://www.npmjs.com/package/@vertexvis/vertex-api-client)
[![MIT License](https://img.shields.io/github/license/vertexvis/vertex-api-client-ts)](https://github.com/Vertexvis/vertex-api-client-ts/blob/main/LICENSE)
[TypeDoc Documentation](https://vertexvis.github.io/vertex-api-client-ts/)

# Deprecation Warning

`@vertexvis/vertex-api-client` is deprecated. Use [`@vertexvis/api-client-node`](https://www.npmjs.com/package/@vertexvis/api-client-node) instead.

If you're ready to integrate Vertex into your application, this is the place! For more background on the Vertex platform, start with [Developer Portal](https://developer.vertexvis.com/).

The Vertex REST API client for Node.js is generated using [`openapi-generator`](https://github.com/OpenAPITools/openapi-generator), so it's always up-to-date. On top of the generated code, we've added a higher-level client and helpers in the `./client` directory.

## Usage

If you're not an existing Vertex customer, [sign up for a free account](https://aws.amazon.com/marketplace/pp/B08PP264Z1?stl=true).

Install the client and export your credentials.

```bash
# Install client
npm install --save @vertexvis/vertex-api-client

# Export your Vertex REST API client ID and secret
export VERTEX_CLIENT_ID=[YOUR_CLIENT_ID]
export VERTEX_CLIENT_SECRET=[YOUR_CLIENT_SECRET]
```

Then, create a client and start using the Vertex API.

```ts
import {
  logError,
  prettyJson,
  VertexClient,
} from '@vertexvis/vertex-api-client';

const main = async () => {
  try {
    // Shown with default values
    const client = await VertexClient.build({
      basePath: 'https://platform.vertexvis.com',
      client: {
        id: process.env.VERTEX_CLIENT_ID,
        secret: process.env.VERTEX_CLIENT_SECRET,
      },
    });

    const getFilesRes = await client.files.getFiles({ pageSize: 1 });

    console.log(prettyJson(getFilesRes.data));
  } catch (error) {
    logError(error, console.error);
  }
};

main();
```

## Local Development

```bash
# Install dependencies
yarn

# Transpile TypeScript to JavaScript
yarn build

# Format code
yarn format

# Generate using latest OpenAPI spec, version, and open GitHub PR
yarn push:version [patch|minor|major (default: patch)]
```
