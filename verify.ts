import { strictEqual } from 'assert';
import { readFileSync } from 'fs';

import { FilesApiAxiosParamCreator } from './api';
import { Configuration } from './configuration';

void verify();

async function verify(): Promise<void> {
  const config = new Configuration();
  const fileAsBuffer = readFileSync('package.json');
  const uploadFileParams = await FilesApiAxiosParamCreator(config).uploadFile(
    'id',
    fileAsBuffer
  );

  try {
    strictEqual(uploadFileParams.options.data, fileAsBuffer);
    console.log('[success] Client verification passed.');
  } catch {
    // See https://github.com/OpenAPITools/openapi-generator/issues/7537
    console.error(
      '[error] Client verification failed: `uploadFile` is broken. To fix it, open `api.ts`, go to `FilesApiAxiosParamCreator.uploadFile`, and hard-code `needsSerialization` to false.'
    );
    process.exit(1);
  }
}
