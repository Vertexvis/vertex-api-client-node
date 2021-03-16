# Vertex API Client

[![Version](https://img.shields.io/npm/v/@vertexvis/vertex-api-client.svg)](https://www.npmjs.com/package/@vertexvis/vertex-api-client)
[![License](https://img.shields.io/npm/l/@vertexvis/vertex-api-client.svg)](https://github.com/Vertexvis/vertex-api-client/blob/master/LICENSE) [TypeDoc Documentation](https://vertexvis.github.io/vertex-api-client-ts/)

If you're ready to integrate Vertex into your application, this is the place! For more background on the Vertex platform, start with [our guides](https://developer.vertexvis.com/docs/guides).

The Vertex platform API client for TypeScript and JavaScript is generated using [`openapi-generator`](https://github.com/OpenAPITools/openapi-generator), so it's always up-to-date. On top of the generated code, we've added a higher-level client and helpers in the `./client` directory.

This client can be used in Node.js, Webpack, and Browserify environments. To use with ES5, you must have a Promises/A+ library installed. It supports CommonJS and ES6 module systems.

## Usage

If you're not an existing Vertex customer, [sign up for a free account](https://aws.amazon.com/marketplace/pp/B08PP264Z1?stl=true).

Install the client and export your credentials.

```bash
# Install client
npm install --save @vertexvis/vertex-api-client

# Export your Vertex Platform API client ID and secret
export VERTEX_CLIENT_ID={CLIENT_ID}
export VERTEX_CLIENT_SECRET={CLIENT_SECRET}
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

# Generate latest client, version, and open GitHub PR
# ARG=minor|major  [default: patch]
yarn push:version [ARG]
```
