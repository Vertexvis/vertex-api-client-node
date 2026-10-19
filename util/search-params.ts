// Recursively adds query parameters to a URLSearchParams object accounting for nested objects.
// This is primarily used to properly serialize filter expressions that are represented this way,
// e.g. Serializing an entry like ['filter[name]']: { contains: 'test' }.
// See https://github.com/OpenAPITools/openapi-generator/issues/7564 + https://github.com/OpenAPITools/openapi-generator/issues/12329.
export const setNestedSearchParam = function (
  searchParams: URLSearchParams,
  key: string,
  value: unknown,
  append = false
): void {
  if (Array.isArray(value)) {
    searchParams.delete(key);
    for (const item of value) {
      setNestedSearchParam(searchParams, key, item, true);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      setNestedSearchParam(
        searchParams,
        `${key}[${nestedKey}]`,
        nestedValue,
        append
      );
    }
  } else if (append) {
    searchParams.append(key, String(value));
  } else {
    searchParams.set(key, String(value));
  }
};
