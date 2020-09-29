# @vertexvis/vertex-api-client

The Vertex platform API client for TypeScript and JavaScript. The generated module can be used in Node.js, Webpack, and Browserify environments. To use with ES5, you must have a Promises/A+ library installed. It supports CommonJS and ES6 module systems.

It can be used in both TypeScript and JavaScript. In TypeScript, type definitions are automatically resolved.

### Usage

Install the client and export your credentials,

```bash
# Install client
npm install --save @vertexvis/vertex-api-client

# Export your Vertex Platform API client ID and secret
export VERTEX_CLIENT_ID={CLIENT_ID}
export VERTEX_CLIENT_SECRET={CLIENT_SECRET}
```

Then, create a client and start using the Vertex API,

```ts
import { prettyJson, VertexClient } from '.';

const main = async () => {
  // Shown with default values
  const client = await VertexClient.build({
    clientId: process.env.VERTEX_CLIENT_ID,
    clientSecret: process.env.VERTEX_CLIENT_SECRET,
    environment: 'platprod',
  });

  const getFilesRes = await client.files.getFiles(undefined, 1);

  console.log(prettyJson(getFilesRes.data));
};

main();
```

### Local Development

```bash
# Install dependencies
npm install

# Transpile TypeScript to JavaScript
npm run build

# Format code
npm run format

# Publish to NPM
npm publish
```
