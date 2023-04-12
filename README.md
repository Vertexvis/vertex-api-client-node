# Vertex API Client for Node.js

[![Version](https://img.shields.io/npm/v/@vertexvis/api-client-node.svg)](https://www.npmjs.com/package/@vertexvis/api-client-node)
[![MIT License](https://img.shields.io/github/license/vertexvis/vertex-api-client-node)](https://github.com/Vertexvis/vertex-api-client-node/blob/main/LICENSE)

[TypeDoc Documentation](https://vertexvis.github.io/vertex-api-client-node/)

If you're ready to integrate Vertex into your application, this is the place! For more background on the Vertex platform, start with our [Developer Portal](https://developer.vertexvis.com/).

The Vertex REST API client for Node.js is generated using [`openapi-generator`](https://github.com/OpenAPITools/openapi-generator), so it's always up-to-date. On top of the generated code, we've added a higher-level client and helpers in the `./client` directory.

## Usage

If you're not an existing Vertex customer, [sign up for a free account](https://aws.amazon.com/marketplace/pp/B08PP264Z1?stl=true).

Install the client and export your credentials.

```bash
# Install client
npm install --save @vertexvis/api-client-node

# Export your Vertex REST API client ID and secret
export VERTEX_CLIENT_ID=[YOUR_CLIENT_ID]
export VERTEX_CLIENT_SECRET=[YOUR_CLIENT_SECRET]
```

Then, create a client and start using the Vertex API.

```ts
import { logError, prettyJson, VertexClient } from '@vertexvis/api-client-node';

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
```

## Publishing
```bash
# Generate latest 
yarn generate

# Generate using latest OpenAPI spec, version, and open GitHub PR
yarn push:version [patch|minor|major (default: patch)]
```