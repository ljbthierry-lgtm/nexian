var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all: all2 = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all: all2, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  __name(assertIs, "assertIs");
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  __name(assertNever, "assertNever");
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  __name(joinValues, "joinValues");
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first2, second) => {
    return {
      ...first2,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = /* @__PURE__ */ __name((data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
}, "getParsedType");

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = /* @__PURE__ */ __name((obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, "quotelessJson");
var ZodError = class _ZodError extends Error {
  static {
    __name(this, "ZodError");
  }
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = /* @__PURE__ */ __name((error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }, "processError");
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = /* @__PURE__ */ __name((issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, "errorMap");
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
__name(setErrorMap, "setErrorMap");
function getErrorMap() {
  return overrideErrorMap;
}
__name(getErrorMap, "getErrorMap");

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = /* @__PURE__ */ __name((params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, "makeIssue");
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
__name(addIssueToContext, "addIssueToContext");
var ParseStatus = class _ParseStatus {
  static {
    __name(this, "ParseStatus");
  }
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = /* @__PURE__ */ __name((value) => ({ status: "dirty", value }), "DIRTY");
var OK = /* @__PURE__ */ __name((value) => ({ status: "valid", value }), "OK");
var isAborted = /* @__PURE__ */ __name((x) => x.status === "aborted", "isAborted");
var isDirty = /* @__PURE__ */ __name((x) => x.status === "dirty", "isDirty");
var isValid = /* @__PURE__ */ __name((x) => x.status === "valid", "isValid");
var isAsync = /* @__PURE__ */ __name((x) => typeof Promise !== "undefined" && x instanceof Promise, "isAsync");

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  static {
    __name(this, "ParseInputLazyPath");
  }
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = /* @__PURE__ */ __name((ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
}, "handleResult");
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = /* @__PURE__ */ __name((iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  }, "customMap");
  return { errorMap: customMap, description };
}
__name(processCreateParams, "processCreateParams");
var ZodType = class {
  static {
    __name(this, "ZodType");
  }
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = /* @__PURE__ */ __name((val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    }, "getIssueProperties");
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = /* @__PURE__ */ __name(() => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      }), "setError");
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: /* @__PURE__ */ __name((data) => this["~validate"](data), "validate")
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
__name(timeRegexSource, "timeRegexSource");
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
__name(timeRegex, "timeRegex");
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
__name(datetimeRegex, "datetimeRegex");
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidIP, "isValidIP");
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
__name(isValidJWT, "isValidJWT");
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidCidr, "isValidCidr");
var ZodString = class _ZodString extends ZodType {
  static {
    __name(this, "ZodString");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
__name(floatSafeRemainder, "floatSafeRemainder");
var ZodNumber = class _ZodNumber extends ZodType {
  static {
    __name(this, "ZodNumber");
  }
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  static {
    __name(this, "ZodBigInt");
  }
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  static {
    __name(this, "ZodBoolean");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  static {
    __name(this, "ZodDate");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  static {
    __name(this, "ZodSymbol");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  static {
    __name(this, "ZodUndefined");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  static {
    __name(this, "ZodNull");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  static {
    __name(this, "ZodAny");
  }
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  static {
    __name(this, "ZodUnknown");
  }
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  static {
    __name(this, "ZodNever");
  }
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  static {
    __name(this, "ZodVoid");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  static {
    __name(this, "ZodArray");
  }
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
__name(deepPartialify, "deepPartialify");
var ZodObject = class _ZodObject extends ZodType {
  static {
    __name(this, "ZodObject");
  }
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: /* @__PURE__ */ __name((issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }, "errorMap")
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...augmentation
      }), "shape")
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }), "shape"),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  static {
    __name(this, "ZodUnion");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    __name(handleResults, "handleResults");
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = /* @__PURE__ */ __name((type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, "getDiscriminator");
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  static {
    __name(this, "ZodDiscriminatedUnion");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
__name(mergeValues, "mergeValues");
var ZodIntersection = class extends ZodType {
  static {
    __name(this, "ZodIntersection");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = /* @__PURE__ */ __name((parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    }, "handleParsed");
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  static {
    __name(this, "ZodTuple");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  static {
    __name(this, "ZodRecord");
  }
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first2, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first2,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first2,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  static {
    __name(this, "ZodMap");
  }
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  static {
    __name(this, "ZodSet");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    __name(finalizeSet, "finalizeSet");
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  static {
    __name(this, "ZodFunction");
  }
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    __name(makeArgsIssue, "makeArgsIssue");
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    __name(makeReturnsIssue, "makeReturnsIssue");
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  static {
    __name(this, "ZodLazy");
  }
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  static {
    __name(this, "ZodLiteral");
  }
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
__name(createZodEnum, "createZodEnum");
var ZodEnum = class _ZodEnum extends ZodType {
  static {
    __name(this, "ZodEnum");
  }
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  static {
    __name(this, "ZodNativeEnum");
  }
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  static {
    __name(this, "ZodPromise");
  }
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  static {
    __name(this, "ZodEffects");
  }
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: /* @__PURE__ */ __name((arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      }, "addIssue"),
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = /* @__PURE__ */ __name((acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      }, "executeRefinement");
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  static {
    __name(this, "ZodOptional");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  static {
    __name(this, "ZodNullable");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  static {
    __name(this, "ZodDefault");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  static {
    __name(this, "ZodCatch");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  static {
    __name(this, "ZodNaN");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  static {
    __name(this, "ZodBranded");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  static {
    __name(this, "ZodPipeline");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = /* @__PURE__ */ __name(async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }, "handleAsync");
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  static {
    __name(this, "ZodReadonly");
  }
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = /* @__PURE__ */ __name((data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    }, "freeze");
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
__name(cleanParams, "cleanParams");
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
__name(custom, "custom");
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = /* @__PURE__ */ __name((cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), "instanceOfType");
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = /* @__PURE__ */ __name(() => stringType().optional(), "ostring");
var onumber = /* @__PURE__ */ __name(() => numberType().optional(), "onumber");
var oboolean = /* @__PURE__ */ __name(() => booleanType().optional(), "oboolean");
var coerce = {
  string: /* @__PURE__ */ __name(((arg) => ZodString.create({ ...arg, coerce: true })), "string"),
  number: /* @__PURE__ */ __name(((arg) => ZodNumber.create({ ...arg, coerce: true })), "number"),
  boolean: /* @__PURE__ */ __name(((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })), "boolean"),
  bigint: /* @__PURE__ */ __name(((arg) => ZodBigInt.create({ ...arg, coerce: true })), "bigint"),
  date: /* @__PURE__ */ __name(((arg) => ZodDate.create({ ...arg, coerce: true })), "date")
};
var NEVER = INVALID;

// src/worker/env.ts
function intVar(raw2, fallback) {
  const n = Number.parseInt(raw2 ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
__name(intVar, "intVar");

// src/worker/lib/db.ts
async function all(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).all();
  return res.results ?? [];
}
__name(all, "all");
async function first(db, sql, ...params) {
  const row = await db.prepare(sql).bind(...params).first();
  return row ?? null;
}
__name(first, "first");
async function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}
__name(run, "run");
var IN_CHUNK = 90;
async function selectByChunks(db, buildSql, values, chunkSize = IN_CHUNK) {
  const out = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    out.push(...await all(db, buildSql(placeholders), ...slice));
  }
  return out;
}
__name(selectByChunks, "selectByChunks");
var uid = /* @__PURE__ */ __name(() => crypto.randomUUID(), "uid");

// src/worker/lib/log.ts
function emit(level, event, data = {}) {
  const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
__name(emit, "emit");
var log = {
  info: /* @__PURE__ */ __name((event, data) => emit("info", event, data), "info"),
  warn: /* @__PURE__ */ __name((event, data) => emit("warn", event, data), "warn"),
  error: /* @__PURE__ */ __name((event, data) => emit("error", event, data), "error")
};

// src/worker/lib/activity.ts
async function logActivity(db, input) {
  try {
    await run(
      db,
      `INSERT INTO activity (id, contact_id, kind, channel, summary, detail, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uid(),
      input.contactId,
      input.kind,
      input.channel ?? null,
      input.summary,
      input.detail ?? null,
      input.actorUserId ?? null
    );
  } catch (e) {
    log.error("activity.write_failed", {
      contact: input.contactId,
      kind: input.kind,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}
__name(logActivity, "logActivity");

// src/worker/lib/availability.ts
function availabilityPhrase(profile) {
  if (!profile) return "not set";
  switch (profile.availability) {
    case "now":
      return "available now";
    case "not_available":
      return "not available at the moment";
    case "from_date":
      return profile.available_from ? `available from ${profile.available_from}` : "not set";
    default:
      return "not set";
  }
}
__name(availabilityPhrase, "availabilityPhrase");
function availabilitySentence(profile) {
  const phrase = availabilityPhrase(profile);
  return phrase === "not set" ? "your availability is not set" : `you are ${phrase}`;
}
__name(availabilitySentence, "availabilitySentence");

// src/worker/lib/baseUrl.ts
var SETTINGS_KEY = "base_url";
function isPlaceholderUrl(url) {
  if (!url) return true;
  return /example\.com|REPLACE|localhost|127\.0\.0\.1/i.test(url);
}
__name(isPlaceholderUrl, "isPlaceholderUrl");
function isLearnableOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && /\.workers\.dev$/i.test(url.hostname);
  } catch {
    return false;
  }
}
__name(isLearnableOrigin, "isLearnableOrigin");
async function rememberOrigin(env, requestUrl) {
  if (!isPlaceholderUrl(env.BASE_URL)) return;
  let origin;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return;
  }
  if (!isLearnableOrigin(origin)) return;
  const existing = await first(
    env.DB,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY
  );
  if (existing?.value === origin) return;
  await run(
    env.DB,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    origin
  );
  log.info("baseurl.learned", { origin });
}
__name(rememberOrigin, "rememberOrigin");
async function resolveBaseUrl(env) {
  if (!isPlaceholderUrl(env.BASE_URL)) return env.BASE_URL.replace(/\/$/, "");
  const stored = await first(
    env.DB,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY
  );
  if (stored?.value) return stored.value.replace(/\/$/, "");
  if (env.APP_ENV !== "development") {
    log.warn("baseurl.unresolved", { configured: env.BASE_URL });
  }
  return (env.BASE_URL ?? "").replace(/\/$/, "");
}
__name(resolveBaseUrl, "resolveBaseUrl");

// src/worker/lib/deliverability.ts
var EMAILABLE_SQL = `ct.email IS NOT NULL AND ct.email_status NOT IN ('bounced', 'complained')`;
function isEmailable(row) {
  if (!row.email) return false;
  return row.email_status !== "bounced" && row.email_status !== "complained";
}
__name(isEmailable, "isEmailable");
var NOTHING = {
  contactStatus: null,
  stopEmailing: false,
  suppress: false,
  bounceKind: null,
  activity: null
};
function isPermanentBounce(bounceType) {
  return /permanent|hard/i.test(bounceType ?? "");
}
__name(isPermanentBounce, "isPermanentBounce");
function classifyDeliveryEvent(type, bounceType, message) {
  switch (type) {
    case "email.delivered":
      return { ...NOTHING, contactStatus: "delivered" };
    case "email.bounced": {
      const permanent = isPermanentBounce(bounceType);
      return {
        contactStatus: permanent ? "bounced" : null,
        stopEmailing: permanent,
        // Never: a dead mailbox is not consent, and suppression is forever.
        suppress: false,
        bounceKind: permanent ? "permanent" : "transient",
        activity: permanent ? `Email address rejected permanently${message ? ` \u2014 ${message}` : ""}. No further email will be sent to it.` : `Temporary delivery problem${message ? ` \u2014 ${message}` : ""}. Will try again.`
      };
    }
    case "email.complained":
      return {
        contactStatus: "complained",
        stopEmailing: true,
        suppress: true,
        bounceKind: "complaint",
        activity: "Marked our email as spam \u2014 added to the permanent do-not-contact list."
      };
    case "email.delivery_delayed":
      return { ...NOTHING, bounceKind: "transient" };
    default:
      return NOTHING;
  }
}
__name(classifyDeliveryEvent, "classifyDeliveryEvent");

// src/worker/lib/rateLimit.ts
var RATE_LIMITS = {
  /** Password attempts, per IP and per account. */
  login: { bucket: "login", limit: 10, windowSeconds: 900 },
  /** New registrations from one address. */
  register: { bucket: "register", limit: 5, windowSeconds: 3600 },
  /** Magic links, counted per target email — this is the anti-bombing limit. */
  linkPerEmail: { bucket: "link_email", limit: 3, windowSeconds: 3600 },
  /** …and per source IP, so one client cannot spray many addresses. */
  linkPerIp: { bucket: "link_ip", limit: 12, windowSeconds: 3600 }
};
function rateLimitKey(rule, identifier, now) {
  const window = Math.floor(now.getTime() / 1e3 / rule.windowSeconds);
  return `${rule.bucket}:${identifier.toLowerCase()}:${window}`;
}
__name(rateLimitKey, "rateLimitKey");
function windowExpiry(rule, now) {
  const window = Math.floor(now.getTime() / 1e3 / rule.windowSeconds);
  return new Date((window + 1) * rule.windowSeconds * 1e3).toISOString();
}
__name(windowExpiry, "windowExpiry");
async function hitRateLimit(db, rule, identifier, now = /* @__PURE__ */ new Date()) {
  const key = rateLimitKey(rule, identifier, now);
  const expires = windowExpiry(rule, now);
  try {
    const row = await first(
      db,
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
      key,
      expires
    );
    const used = row?.count ?? 1;
    return {
      allowed: used <= rule.limit,
      used,
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(expires) - now.getTime()) / 1e3))
    };
  } catch (e) {
    log.error("ratelimit.failed_open", {
      bucket: rule.bucket,
      error: e instanceof Error ? e.message : String(e)
    });
    return { allowed: true, used: 0, retryAfterSeconds: 0 };
  }
}
__name(hitRateLimit, "hitRateLimit");
async function pruneRateLimits(db, now = /* @__PURE__ */ new Date()) {
  await run(db, `DELETE FROM rate_limits WHERE expires_at < ?`, now.toISOString());
}
__name(pruneRateLimits, "pruneRateLimits");
function clientIp(headers) {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? "unknown";
}
__name(clientIp, "clientIp");

// src/worker/modules/admin/retention.ts
async function findExpiredProspects(env, now = /* @__PURE__ */ new Date()) {
  const days = intVar(env.PROSPECT_RETENTION_DAYS, 365);
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString();
  return all(
    env.DB,
    `SELECT ct.id, ct.email, ct.created_at, ct.last_outreach_at
     FROM contacts ct
     WHERE ct.anonymized_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
       AND COALESCE(ct.last_outreach_at, ct.created_at) < ?
     LIMIT 500`,
    cutoff
  );
}
__name(findExpiredProspects, "findExpiredProspects");
async function anonymiseContact(env, id) {
  await run(
    env.DB,
    `UPDATE contacts
       SET first_name = '', last_name = '', phone = NULL, linkedin_url = NULL,
           email = 'expired+' || id || '@invalid', internal_notes = NULL,
           source_note = NULL, stage = 'closed',
           anonymized_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    id
  );
  await run(env.DB, `DELETE FROM action_tokens WHERE contact_id = ?`, id);
  await logActivity(env.DB, {
    contactId: id,
    kind: "anonymized",
    summary: "Personal details removed \u2014 retention period expired without registration"
  });
}
__name(anonymiseContact, "anonymiseContact");
async function runRetentionSweep(env, now = /* @__PURE__ */ new Date()) {
  const expired = await findExpiredProspects(env, now);
  for (const candidate of expired) await anonymiseContact(env, candidate.id);
  if (expired.length) log.info("retention.swept", { count: expired.length });
  return expired.length;
}
__name(runRetentionSweep, "runRetentionSweep");

// src/worker/modules/notifications/resend.ts
async function sendEmail(env, mail) {
  let ok = false;
  let providerId = null;
  let error = null;
  if (!env.RESEND_API_KEY && env.APP_ENV === "development") {
    ok = true;
    providerId = "dev-noop";
    log.info("email.dev_noop", { contact: mail.contactId, template: mail.template });
  } else if (!env.RESEND_API_KEY) {
    error = "RESEND_API_KEY not configured";
    log.warn("email.skipped_no_key", { contact: mail.contactId, template: mail.template });
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          ...mail.replyTo ? { reply_to: [mail.replyTo] } : {}
        })
      });
      if (res.ok) {
        const body = await res.json();
        providerId = body.id ?? null;
        ok = true;
      } else {
        error = `Resend ${res.status}: ${(await res.text()).slice(0, 500)}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (id, to_email, template, subject, contact_id, campaign_id, status, provider_id, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      uid(),
      mail.to,
      mail.template,
      mail.subject,
      mail.contactId ?? null,
      mail.campaignId ?? null,
      ok ? "sent" : "failed",
      providerId,
      error
    ).run();
  } catch (e) {
    log.error("email.log_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  if (!ok) log.warn("email.failed", { contact: mail.contactId, template: mail.template, error });
  return ok;
}
__name(sendEmail, "sendEmail");

// src/worker/lib/html.ts
var LOGO_PATH = "/logo.png";
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(esc, "esc");
function actionPage(o) {
  const tone = o.tone ?? "normal";
  const accent = tone === "good" ? "#2e7d4f" : tone === "warn" ? "#a8690f" : "#85509b";
  const button = o.action ? o.action.method === "post" ? `<form method="post"><button class="btn" type="submit">${esc(o.action.label)}</button></form>` : `<a class="btn" href="${esc(o.action.href ?? "/")}">${esc(o.action.label)}</a>` : "";
  const secondary = o.secondary ? `<p class="alt"><a href="${esc(o.secondary.href)}">${esc(o.secondary.label)}</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<link rel="icon" type="image/png" href="/favicon-tiles.png">
<style>
  :root{color-scheme:light}
  body{margin:0;background:#f4f2f6;color:#25202b;
    font:16px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif;
    display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{background:#fff;border:1px solid #e4dfe9;border-radius:14px;max-width:520px;width:100%;
    padding:0 0 30px;overflow:hidden;box-shadow:0 10px 34px rgba(90,16,76,.10)}
  .brand{padding:22px 28px 0}
  .brand img{height:34px;display:block}
  .inner{padding:20px 28px 0}
  h1{font-size:22px;line-height:1.25;margin:0 0 12px;color:#25202b}
  p{margin:0 0 14px;color:#5c5566}
  .btn{display:inline-block;background:${accent};color:#fff;text-decoration:none;border:0;
    border-radius:8px;padding:13px 26px;font:inherit;font-weight:700;cursor:pointer;margin-top:6px}
  .btn:hover{filter:brightness(1.08)}
  .alt{margin-top:18px;font-size:14px}
  .alt a{color:#85509b}
  .foot{margin:24px 28px 0;padding-top:14px;border-top:1px solid #eee7ef;font-size:12.5px;color:#8a8194}
</style></head>
<body><div class="card">
  <div class="brand"><img src="${LOGO_PATH}" alt="Nexian"></div>
  <div class="inner">
    <h1>${esc(o.heading)}</h1>
    ${o.body}
    ${button}
    ${secondary}
  </div>
  <div class="foot">Nexian &middot; powered by Solvint Group</div>
</div></body></html>`;
}
__name(actionPage, "actionPage");
function emailShell(opts) {
  const footerLinks = opts.unsubscribeUrl ? ` &middot; <a href="${esc(opts.unsubscribeUrl)}" style="color:#8a8194">Unsubscribe</a>` : "";
  return `<div style="margin:0;padding:24px 12px;background:#f4f2f6;
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#25202b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4dfe9;
    border-radius:12px;overflow:hidden">
    <div style="padding:22px 24px 0">
      <img src="${esc(opts.baseUrl)}${LOGO_PATH}" alt="${esc(opts.companyName)}"
        style="height:30px;display:block;border:0">
    </div>
    <div style="padding:20px 24px 4px;font-size:15px;line-height:1.6">${opts.body}</div>
    <div style="padding:14px 24px 20px;border-top:1px solid #eee7ef;font-size:12px;color:#8a8194">
      ${esc(opts.companyName)} &middot; powered by Solvint Group${footerLinks}
    </div>
  </div>
</div>`;
}
__name(emailShell, "emailShell");
function emailButton(href, label, color = "#85509b") {
  return `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;
    text-decoration:none;border-radius:8px;padding:13px 26px;font-weight:700;margin:6px 0">${esc(label)}</a>`;
}
__name(emailButton, "emailButton");
function textToHtml(text) {
  return text.split(/\n{2,}/).map((block) => `<p style="margin:0 0 14px">${esc(block).replace(/\n/g, "<br>")}</p>`).join("");
}
__name(textToHtml, "textToHtml");

// src/worker/modules/notifications/templates.ts
var SOURCE_SENTENCE = {
  linkedin: "We found your profile on LinkedIn.",
  referral: "You were recommended to us by someone in our network.",
  event: "We met, or were introduced, at a professional event.",
  import: "Your details reached us through our professional network.",
  manual: "Your details reached us through our professional network.",
  self_signup: "You asked us to get in touch."
};
function greeting(firstName) {
  const name = firstName.trim();
  return name ? `Hi ${esc(name)},` : "Hello,";
}
__name(greeting, "greeting");
function inviteEmail(ctx, o) {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>I'm ${esc(o.senderName)} from ${esc(ctx.companyName)}. We're a consulting firm, and we
       regularly place experienced freelancers on client missions.</p>
    <p>We're building a pool of freelancers we can call on when a mission fits. If that could
       interest you, you can add yourself in about three minutes \u2014 your experience, skills,
       day rate, availability and CV. No account or password needed, and you stay in control
       of what we hold.</p>
    <p>${emailButton(o.registerUrl, "Add me to the pool")}</p>
    <p style="font-size:13px;color:#8a8194">
      ${esc(SOURCE_SENTENCE[o.source] ?? SOURCE_SENTENCE.manual)}
      We contact you on the basis of legitimate interest for professional purposes, and we will
      not add you to any mailing list unless you ask us to.
      <a href="${esc(o.optOutUrl)}" style="color:#8a8194">Don't contact me again</a>.
    </p>`;
  return {
    subject: `${ctx.companyName} \u2014 freelance missions, if you're interested`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(inviteEmail, "inviteEmail");
function followUpEmail(ctx, o) {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>A short follow-up to my earlier message. If joining the ${esc(ctx.companyName)} freelance
       pool is of interest, the form takes about three minutes.</p>
    <p>${emailButton(o.registerUrl, "Add me to the pool")}</p>
    <p>If it isn't, no problem at all \u2014 this is the last you'll hear from me.</p>
    <p style="font-size:13px;color:#8a8194">
      <a href="${esc(o.optOutUrl)}" style="color:#8a8194">Don't contact me again</a>.
    </p>`;
  return {
    subject: `Following up \u2014 ${ctx.companyName} freelance pool`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(followUpEmail, "followUpEmail");
function welcomeEmail(ctx, o) {
  const list = o.consentSummary.length ? `<ul style="margin:0 0 14px;padding-left:20px;color:#5c5566">
         ${o.consentSummary.map((s) => `<li>${esc(s)}</li>`).join("")}
       </ul>` : "";
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Thanks \u2014 you're in the ${esc(ctx.companyName)} freelance pool. When a mission matches your
       profile, we'll get in touch.</p>
    <p>What you agreed to:</p>
    ${list}
    <p>You can change any of it, update your day rate and availability, replace your CV, or delete
       your profile entirely, at any time:</p>
    <p>${emailButton(o.portalUrl, "Open my profile")}</p>
    <p style="font-size:13px;color:#8a8194">This link is personal and valid for 7 days. You can
       always request a new one from the registration page.</p>`;
  return {
    subject: `You're in the ${ctx.companyName} freelance pool`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(welcomeEmail, "welcomeEmail");
function portalLinkEmail(ctx, o) {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Here's your personal link to update your ${esc(ctx.companyName)} profile \u2014 your day rate,
       availability, skills and CV.</p>
    <p>${emailButton(o.portalUrl, "Open my profile")}</p>
    <p style="font-size:13px;color:#8a8194">The link works once and expires in 7 days. If you
       didn't ask for it, you can ignore this email.</p>`;
  return {
    subject: `Your ${ctx.companyName} profile link`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(portalLinkEmail, "portalLinkEmail");
function availabilityReminderEmail(ctx, o) {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Your profile in our freelance pool says ${esc(o.availabilityLine)}. Missions come in
       regularly, and an up-to-date profile is the first one we look at.</p>
    <p>${emailButton(o.confirmUrl, "Still correct \u2014 keep me as is", "#2e7d4f")}</p>
    <p style="font-size:14px"><a href="${esc(o.portalUrl)}" style="color:#85509b">Something
       changed \u2014 update my profile</a></p>`;
  return {
    subject: "Is your availability still up to date?",
    html: emailShell({
      body,
      companyName: ctx.companyName,
      baseUrl: ctx.baseUrl,
      unsubscribeUrl: o.unsubscribeUrl
    })
  };
}
__name(availabilityReminderEmail, "availabilityReminderEmail");
function campaignEmail(ctx, o) {
  const personalised = o.body.replace(/\{first_name\}/g, o.firstName.trim() || "there");
  const body = `
    ${textToHtml(personalised)}
    <p style="font-size:13px;color:#8a8194;margin-top:18px">
      <a href="${esc(o.portalUrl)}" style="color:#85509b">Update your profile or availability</a>
    </p>`;
  return {
    subject: o.subject,
    html: emailShell({
      body,
      companyName: ctx.companyName,
      baseUrl: ctx.baseUrl,
      unsubscribeUrl: o.unsubscribeUrl
    })
  };
}
__name(campaignEmail, "campaignEmail");
function signInCodeEmail(ctx, o) {
  const body = `
    <p>${greeting(o.name)}</p>
    <p>Your sign-in code for the ${esc(ctx.companyName)} talent pool:</p>
    <p style="font-size:34px;font-weight:700;letter-spacing:.18em;margin:18px 0;
       font-family:Consolas,Menlo,monospace;color:#5A104C">${esc(o.code)}</p>
    <p>It expires in ${o.minutes} minutes and can be used once.</p>
    <p style="font-size:13px;color:#8a8194;margin-top:20px">
      If you were not signing in, someone else knows your password. Change it as soon
      as you can, and tell whoever administers the platform.</p>`;
  return {
    subject: `${o.code} is your ${ctx.companyName} sign-in code`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(signInCodeEmail, "signInCodeEmail");
function alertEmail(ctx, o) {
  const body = `
    <p style="font-size:13px;color:#8a8194;margin:0 0 6px;text-transform:uppercase;
       letter-spacing:.08em">${esc(o.severity)}</p>
    <p style="font-size:17px;font-weight:700;margin:0 0 12px">${esc(o.summary)}</p>
    <p>${esc(o.detail)}</p>
    <p style="font-size:13px;color:#8a8194">Recorded ${esc(o.when)}. Open the talent pool and go to
       Settings \u2192 Access log to see the full record, including who else has downloaded what.</p>
    <p style="font-size:13px;color:#8a8194">If this was expected, no action is needed \u2014 the alert
       stays in the log either way.</p>`;
  return {
    subject: `${ctx.companyName} talent pool \u2014 ${o.summary}`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(alertEmail, "alertEmail");
function setPasswordEmail(ctx, o) {
  const body = `
    <p>${greeting(o.name)}</p>
    <p>An account was created for you on the ${esc(ctx.companyName)} talent pool.</p>
    <p>${emailButton(o.url, "Choose a password")}</p>
    <p style="font-size:13px;color:#8a8194">This link works once and expires in 14 days.</p>`;
  return {
    subject: `Your ${ctx.companyName} talent pool account`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl })
  };
}
__name(setPasswordEmail, "setPasswordEmail");

// src/worker/lib/crypto.ts
var PBKDF2_ITERATIONS = 1e5;
var enc = new TextEncoder();
function toHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
__name(toHex, "toHex");
function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}
__name(randomToken, "randomToken");
async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(digest);
}
__name(sha256Hex, "sha256Hex");
async function hashPassword(password, saltHex) {
  const salt = saltHex ?? randomToken(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS
    },
    key,
    256
  );
  return { hash: toHex(bits), salt };
}
__name(hashPassword, "hashPassword");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHash);
}
__name(verifyPassword, "verifyPassword");

// src/worker/modules/notifications/tokens.ts
var REUSABLE_PURPOSES = /* @__PURE__ */ new Set(["unsubscribe", "join_prefill"]);
var DEFAULT_TTL_DAYS = {
  portal_link: 7,
  confirm_availability: 60,
  unsubscribe: 365,
  set_password: 14,
  // Long enough for a paced wave plus a LinkedIn queue worked over weeks.
  join_prefill: 60
};
async function createActionToken(db, opts) {
  const raw2 = randomToken(32);
  const hash = await sha256Hex(raw2);
  const ttl = opts.ttlDays ?? DEFAULT_TTL_DAYS[opts.purpose];
  const expires = new Date(Date.now() + ttl * 864e5).toISOString();
  await run(
    db,
    `INSERT INTO action_tokens (token_hash, purpose, contact_id, user_id, payload, single_use, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    hash,
    opts.purpose,
    opts.contactId ?? null,
    opts.userId ?? null,
    JSON.stringify(opts.payload ?? {}),
    REUSABLE_PURPOSES.has(opts.purpose) ? 0 : 1,
    expires
  );
  return raw2;
}
__name(createActionToken, "createActionToken");
async function peekActionToken(db, rawToken) {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const hash = await sha256Hex(rawToken);
  const row = await first(
    db,
    `SELECT * FROM action_tokens WHERE token_hash = ?`,
    hash
  );
  if (!row) return null;
  if (row.expires_at < (/* @__PURE__ */ new Date()).toISOString()) return null;
  if (row.single_use === 1 && row.used_at) return null;
  return row;
}
__name(peekActionToken, "peekActionToken");
async function consumeActionToken(db, rawToken, expectedPurpose) {
  const row = await peekActionToken(db, rawToken);
  if (!row || row.purpose !== expectedPurpose) return null;
  if (row.single_use === 0) return row;
  const res = await run(
    db,
    `UPDATE action_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL`,
    row.token_hash
  );
  if (!res.meta.changes) return null;
  return row;
}
__name(consumeActionToken, "consumeActionToken");
async function revokeTokens(db, contactId, purpose) {
  if (purpose) {
    await run(
      db,
      `DELETE FROM action_tokens WHERE contact_id = ? AND purpose = ?`,
      contactId,
      purpose
    );
  } else {
    await run(db, `DELETE FROM action_tokens WHERE contact_id = ?`, contactId);
  }
}
__name(revokeTokens, "revokeTokens");

// src/worker/modules/outreach/channel.ts
var KEY = "outreach_channel_priority";
async function readChannelPriority(db) {
  const row = await first(db, `SELECT value FROM settings WHERE key = ?`, KEY);
  return row?.value === "linkedin" ? "linkedin" : "email";
}
__name(readChannelPriority, "readChannelPriority");
async function writeChannelPriority(db, value) {
  await run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    KEY,
    value === "linkedin" ? "linkedin" : "email"
  );
}
__name(writeChannelPriority, "writeChannelPriority");
function emailChannelSql(preferred) {
  return preferred === "linkedin" ? "AND (ct.linkedin_url IS NULL OR ct.linkedin_url = '')" : "";
}
__name(emailChannelSql, "emailChannelSql");
function linkedinChannelSql(preferred) {
  return preferred === "email" ? "AND (ct.email IS NULL OR ct.email_status IN ('bounced', 'complained'))" : "";
}
__name(linkedinChannelSql, "linkedinChannelSql");

// src/worker/modules/outreach/eligibility.ts
function decideOutreach(candidate, policy, now = /* @__PURE__ */ new Date()) {
  if (candidate.suppressed) return { allowed: false, reason: "Marked do-not-contact" };
  if (candidate.anonymized) return { allowed: false, reason: "Record has been anonymised" };
  if (candidate.hasProfile) return { allowed: false, reason: "Already registered in the pool" };
  if (candidate.replied) return { allowed: false, reason: "They have already replied" };
  if (candidate.emailUndeliverable) {
    return { allowed: false, reason: "Email address is undeliverable" };
  }
  if (candidate.outreachCount >= policy.maxTouches) {
    return {
      allowed: false,
      reason: `Already contacted ${candidate.outreachCount}\xD7 \u2014 limit reached`
    };
  }
  if (candidate.outreachCount === 0) return { allowed: true, kind: "invite" };
  if (!candidate.lastOutreachAt) return { allowed: true, kind: "followup" };
  const last = Date.parse(candidate.lastOutreachAt);
  if (Number.isNaN(last)) return { allowed: true, kind: "followup" };
  const daysSince = (now.getTime() - last) / 864e5;
  if (daysSince < policy.followUpAfterDays) {
    const wait = Math.ceil(policy.followUpAfterDays - daysSince);
    return { allowed: false, reason: `Follow-up is due in ${wait} day${wait === 1 ? "" : "s"}` };
  }
  return { allowed: true, kind: "followup" };
}
__name(decideOutreach, "decideOutreach");

// src/worker/modules/outreach/send.ts
function policyOf(env) {
  return {
    maxTouches: intVar(env.MAX_OUTREACH_TOUCHES, 2),
    followUpAfterDays: intVar(env.FOLLOWUP_AFTER_DAYS, 10)
  };
}
__name(policyOf, "policyOf");
var CANDIDATE_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
         ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
         ct.email_status, ct.replied_at,
         (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
  FROM contacts ct`;
function toCandidate(row) {
  return {
    suppressed: row.suppressed === 1,
    anonymized: row.anonymized_at !== null,
    hasProfile: row.has_profile > 0,
    outreachCount: row.outreach_count,
    lastOutreachAt: row.last_outreach_at,
    replied: row.replied_at != null,
    emailUndeliverable: !isEmailable({ email: row.email, email_status: row.email_status })
  };
}
__name(toCandidate, "toCandidate");
async function sendOutreachTo(env, row, senderName, actorUserId, now = /* @__PURE__ */ new Date()) {
  const decision = decideOutreach(toCandidate(row), policyOf(env), now);
  if (!decision.allowed) {
    return { id: row.id, email: row.email ?? "", sent: false, reason: decision.reason };
  }
  if (!row.email) {
    return {
      id: row.id,
      email: "",
      sent: false,
      reason: "No email address \u2014 reach them through the LinkedIn queue"
    };
  }
  const baseUrl = await resolveBaseUrl(env);
  const ctx = { companyName: env.COMPANY_NAME, baseUrl };
  const optOutToken = await createActionToken(env.DB, {
    purpose: "unsubscribe",
    contactId: row.id,
    payload: { scope: "all" }
  });
  const inviteToken = await createActionToken(env.DB, {
    purpose: "join_prefill",
    contactId: row.id,
    payload: { channel: "email" }
  });
  const registerUrl = `${baseUrl}/join?invite=${inviteToken}`;
  const optOutUrl = `${baseUrl}/a/${optOutToken}`;
  const mail = decision.kind === "invite" ? inviteEmail(ctx, {
    firstName: row.first_name,
    source: row.source,
    registerUrl,
    optOutUrl,
    senderName
  }) : followUpEmail(ctx, {
    firstName: row.first_name,
    registerUrl,
    optOutUrl,
    senderName
  });
  const ok = await sendEmail(env, {
    to: row.email,
    subject: mail.subject,
    html: mail.html,
    template: decision.kind,
    contactId: row.id
  });
  if (ok) {
    await run(
      env.DB,
      `UPDATE contacts
         SET outreach_count = outreach_count + 1,
             first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
             last_outreach_at = datetime('now'),
             stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
             updated_at = datetime('now')
       WHERE id = ?`,
      row.id
    );
  }
  await logActivity(env.DB, {
    contactId: row.id,
    kind: ok ? "email_sent" : "email_failed",
    channel: "email",
    summary: ok ? `Sent the ${decision.kind === "invite" ? "invitation" : "follow-up"} email` : `Failed to send the ${decision.kind} email`,
    actorUserId
  });
  return {
    id: row.id,
    email: row.email,
    sent: ok,
    kind: decision.kind,
    reason: ok ? void 0 : "The email provider rejected the message"
  };
}
__name(sendOutreachTo, "sendOutreachTo");

// src/worker/modules/outreach/wave.ts
var SETTINGS_KEY2 = "invite_wave";
var MAX_WAVE_PER_RUN = 40;
var DEFAULT_DAILY_LIMIT = 40;
var IDLE = {
  active: false,
  dailyLimit: DEFAULT_DAILY_LIMIT,
  startedAt: null,
  completedAt: null
};
async function readWave(db) {
  const row = await first(
    db,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY2
  );
  if (!row) return { ...IDLE };
  try {
    const parsed = JSON.parse(row.value);
    return {
      active: parsed.active === true,
      dailyLimit: clampLimit(parsed.dailyLimit),
      startedAt: parsed.startedAt ?? null,
      completedAt: parsed.completedAt ?? null
    };
  } catch {
    return { ...IDLE };
  }
}
__name(readWave, "readWave");
async function writeWave(db, state) {
  await run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY2,
    JSON.stringify(state)
  );
}
__name(writeWave, "writeWave");
function clampLimit(value) {
  const n = typeof value === "number" ? Math.floor(value) : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_LIMIT;
  return Math.min(Math.max(n, 1), 100);
}
__name(clampLimit, "clampLimit");
function waveSelect(preferred) {
  return `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
         ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
         ct.email_status, ct.replied_at,
         (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
  FROM contacts ct
  WHERE ct.suppressed = 0
    AND ct.anonymized_at IS NULL
    AND ${EMAILABLE_SQL}
    AND ct.replied_at IS NULL
    AND ct.outreach_count = 0
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
    ${emailChannelSql(preferred)}
  ORDER BY ct.created_at ASC`;
}
__name(waveSelect, "waveSelect");
async function countWaveRemaining(db) {
  const preferred = await readChannelPriority(db);
  const row = await first(
    db,
    `SELECT COUNT(*) AS n FROM (${waveSelect(preferred)})`
  );
  return row?.n ?? 0;
}
__name(countWaveRemaining, "countWaveRemaining");
async function runInviteWave(env, now = /* @__PURE__ */ new Date()) {
  const state = await readWave(env.DB);
  if (!state.active) return { sent: 0, remaining: 0, finished: false };
  const batch = Math.min(state.dailyLimit, MAX_WAVE_PER_RUN);
  const preferred = await readChannelPriority(env.DB);
  const rows = await all(env.DB, `${waveSelect(preferred)} LIMIT ?`, batch);
  let sent = 0;
  for (const row of rows) {
    const result = await sendOutreachTo(env, row, env.COMPANY_NAME, null, now);
    if (result.sent) sent++;
  }
  const remaining = await countWaveRemaining(env.DB);
  const finished = remaining === 0;
  if (finished) {
    await writeWave(env.DB, {
      ...state,
      active: false,
      completedAt: now.toISOString()
    });
    log.info("wave.completed", { sent });
  } else {
    log.info("wave.step", { sent, remaining });
  }
  return { sent, remaining, finished };
}
__name(runInviteWave, "runInviteWave");

// src/worker/cron.ts
var MAX_FOLLOWUPS_PER_RUN = 100;
var MAX_REMINDERS_PER_RUN = 200;
async function sendDueFollowUps(env, now = /* @__PURE__ */ new Date()) {
  const waitDays = intVar(env.FOLLOWUP_AFTER_DAYS, 10);
  const maxTouches = intVar(env.MAX_OUTREACH_TOUCHES, 2);
  if (maxTouches < 2) return 0;
  const cutoff = new Date(now.getTime() - waitDays * 864e5).toISOString();
  const preferred = await readChannelPriority(env.DB);
  const rows = await all(
    env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
            ct.email_status, ct.replied_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ${EMAILABLE_SQL}
       AND ct.replied_at IS NULL
       AND ct.outreach_count = 1
       AND ct.last_outreach_at IS NOT NULL
       AND ct.last_outreach_at < ?
       AND ct.linkedin_state != 'queued'
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
       ${emailChannelSql(preferred)}
     ORDER BY ct.last_outreach_at ASC
     LIMIT ?`,
    cutoff,
    MAX_FOLLOWUPS_PER_RUN
  );
  let sent = 0;
  for (const row of rows) {
    const result = await sendOutreachTo(env, row, env.COMPANY_NAME, null, now);
    if (result.sent) sent++;
  }
  if (sent) log.info("cron.followups", { sent });
  return sent;
}
__name(sendDueFollowUps, "sendDueFollowUps");
async function sendAvailabilityReminders(env, now = /* @__PURE__ */ new Date()) {
  const everyDays = intVar(env.AVAILABILITY_REMINDER_DAYS, 90);
  const cutoff = new Date(now.getTime() - everyDays * 864e5).toISOString();
  const baseUrl = await resolveBaseUrl(env);
  const ctx = { companyName: env.COMPANY_NAME, baseUrl };
  const rows = await all(
    env.DB,
    `SELECT ct.id, ct.email, ct.first_name, p.availability, p.available_from, p.daily_rate
     FROM contacts ct
     JOIN profiles p ON p.contact_id = ct.id
     JOIN consent_current cc
       ON cc.contact_id = ct.id AND cc.purpose = 'mission_alerts' AND cc.granted = 1
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ${EMAILABLE_SQL}
       AND COALESCE(p.last_confirmed_at, p.updated_at) < ?
       AND (p.last_reminded_at IS NULL OR p.last_reminded_at < ?)
     ORDER BY COALESCE(p.last_confirmed_at, p.updated_at) ASC
     LIMIT ?`,
    cutoff,
    cutoff,
    MAX_REMINDERS_PER_RUN
  );
  let sent = 0;
  for (const row of rows) {
    const confirmToken = await createActionToken(env.DB, {
      purpose: "confirm_availability",
      contactId: row.id
    });
    const portalToken = await createActionToken(env.DB, {
      purpose: "portal_link",
      contactId: row.id
    });
    const unsubToken = await createActionToken(env.DB, {
      purpose: "unsubscribe",
      contactId: row.id,
      payload: { scope: "mission_alerts" }
    });
    const mail = availabilityReminderEmail(ctx, {
      firstName: row.first_name,
      availabilityLine: availabilitySentence(row),
      confirmUrl: `${baseUrl}/a/${confirmToken}`,
      portalUrl: `${baseUrl}/a/${portalToken}`,
      unsubscribeUrl: `${baseUrl}/a/${unsubToken}`
    });
    const ok = await sendEmail(env, {
      to: row.email,
      subject: mail.subject,
      html: mail.html,
      template: "availability_reminder",
      contactId: row.id
    });
    await run(
      env.DB,
      `UPDATE profiles SET last_reminded_at = datetime('now') WHERE contact_id = ?`,
      row.id
    );
    if (ok) {
      sent++;
      await logActivity(env.DB, {
        contactId: row.id,
        kind: "email_sent",
        channel: "email",
        summary: "Sent the availability reminder"
      });
    }
  }
  if (sent) log.info("cron.reminders", { sent });
  return sent;
}
__name(sendAvailabilityReminders, "sendAvailabilityReminders");
async function runScheduledJobs(env) {
  const started = Date.now();
  try {
    const wave = await runInviteWave(env);
    const followUps = await sendDueFollowUps(env);
    const reminders = await sendAvailabilityReminders(env);
    const anonymised = await runRetentionSweep(env);
    await pruneRateLimits(env.DB);
    log.info("cron.done", {
      waveSent: wave.sent,
      waveRemaining: wave.remaining,
      followUps,
      reminders,
      anonymised,
      ms: Date.now() - started
    });
  } catch (e) {
    log.error("cron.failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
__name(runScheduledJobs, "runScheduledJobs");

// src/worker/lib/errors.ts
var AppError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AppError";
  }
  status;
  code;
  static {
    __name(this, "AppError");
  }
};
var badRequest = /* @__PURE__ */ __name((msg, code = "bad_request") => new AppError(400, code, msg), "badRequest");
var unauthorized = /* @__PURE__ */ __name((msg = "Authentication required") => new AppError(401, "unauthorized", msg), "unauthorized");
var forbidden = /* @__PURE__ */ __name((msg = "Not allowed for your role") => new AppError(403, "forbidden", msg), "forbidden");
var notFound = /* @__PURE__ */ __name((msg = "Not found") => new AppError(404, "not_found", msg), "notFound");
var conflict = /* @__PURE__ */ __name((msg) => new AppError(409, "conflict", msg), "conflict");
var tooManyRequests = /* @__PURE__ */ __name((msg) => new AppError(429, "rate_limited", msg), "tooManyRequests");

// src/worker/lib/securityHeaders.ts
var CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'"
].join("; ");
function harden(headers) {
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}
__name(harden, "harden");

// node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = /* @__PURE__ */ __name((value) => {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const charCode = value.charCodeAt(start);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    start++;
  }
  while (end > start) {
    const charCode = value.charCodeAt(end - 1);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    end--;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
}, "trimCookieWhitespace");
var parse = /* @__PURE__ */ __name((cookie, name) => {
  if (name && cookie.indexOf(name) === -1) {
    return {};
  }
  const pairs = cookie.split(";");
  const parsedCookie = /* @__PURE__ */ Object.create(null);
  for (const pairStr of pairs) {
    const valueStartPos = pairStr.indexOf("=");
    if (valueStartPos === -1) {
      continue;
    }
    const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
    if (name && name !== cookieName || !validCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) {
      continue;
    }
    let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
    if (cookieValue.startsWith('"') && cookieValue.endsWith('"')) {
      cookieValue = cookieValue.slice(1, -1);
    }
    if (validCookieValueRegEx.test(cookieValue)) {
      parsedCookie[cookieName] = cookieValue.indexOf("%") !== -1 ? tryDecode(cookieValue, decodeURIComponent_) : cookieValue;
      if (name) {
        break;
      }
    }
  }
  return parsedCookie;
}, "parse");
var _serialize = /* @__PURE__ */ __name((name, value, opt = {}) => {
  if (!validCookieNameRegEx.test(name)) {
    throw new Error("Invalid cookie name");
  }
  let cookie = `${name}=${value}`;
  if (name.startsWith("__Secure-") && !opt.secure) {
    throw new Error("__Secure- Cookie must have Secure attributes");
  }
  if (name.startsWith("__Host-")) {
    if (!opt.secure) {
      throw new Error("__Host- Cookie must have Secure attributes");
    }
    if (opt.path !== "/") {
      throw new Error('__Host- Cookie must have Path attributes with "/"');
    }
    if (opt.domain) {
      throw new Error("__Host- Cookie must not have Domain attributes");
    }
  }
  for (const key of ["domain", "path", "sameSite", "priority"]) {
    if (opt[key] && /[;\r\n]/.test(opt[key])) {
      throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
    }
  }
  if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
    if (opt.maxAge > 3456e4) {
      throw new Error(
        "Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration."
      );
    }
    cookie += `; Max-Age=${opt.maxAge | 0}`;
  }
  if (opt.domain && opt.prefix !== "host") {
    cookie += `; Domain=${opt.domain}`;
  }
  if (opt.path) {
    cookie += `; Path=${opt.path}`;
  }
  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 3456e7) {
      throw new Error(
        "Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future."
      );
    }
    cookie += `; Expires=${opt.expires.toUTCString()}`;
  }
  if (opt.httpOnly) {
    cookie += "; HttpOnly";
  }
  if (opt.secure) {
    cookie += "; Secure";
  }
  if (opt.sameSite) {
    cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
  }
  if (opt.priority) {
    cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
  }
  if (opt.partitioned) {
    if (!opt.secure) {
      throw new Error("Partitioned Cookie must have Secure attributes");
    }
    cookie += "; Partitioned";
  }
  return cookie;
}, "_serialize");
var serialize = /* @__PURE__ */ __name((name, value, opt) => {
  value = encodeURIComponent(value);
  return _serialize(name, value, opt);
}, "serialize");

// node_modules/hono/dist/helper/cookie/index.js
var getCookie = /* @__PURE__ */ __name((c, key, prefix) => {
  const cookie = c.req.raw.headers.get("Cookie");
  if (typeof key === "string") {
    if (!cookie) {
      return void 0;
    }
    let finalKey = key;
    if (prefix === "secure") {
      finalKey = "__Secure-" + key;
    } else if (prefix === "host") {
      finalKey = "__Host-" + key;
    }
    const obj2 = parse(cookie, finalKey);
    return obj2[finalKey];
  }
  if (!cookie) {
    return {};
  }
  const obj = parse(cookie);
  return obj;
}, "getCookie");
var generateCookie = /* @__PURE__ */ __name((name, value, opt) => {
  let cookie;
  if (opt?.prefix === "secure") {
    cookie = serialize("__Secure-" + name, value, { path: "/", ...opt, secure: true });
  } else if (opt?.prefix === "host") {
    cookie = serialize("__Host-" + name, value, {
      ...opt,
      path: "/",
      secure: true,
      domain: void 0
    });
  } else {
    cookie = serialize(name, value, { path: "/", ...opt });
  }
  return cookie;
}, "generateCookie");
var setCookie = /* @__PURE__ */ __name((c, name, value, opt) => {
  const cookie = generateCookie(name, value, opt);
  c.header("Set-Cookie", cookie, { append: true });
}, "setCookie");
var deleteCookie = /* @__PURE__ */ __name((c, name, opt) => {
  const deletedCookie = getCookie(c, name, opt?.prefix);
  setCookie(c, name, "", { ...opt, maxAge: 0 });
  return deletedCookie;
}, "deleteCookie");

// src/worker/middleware/auth.ts
var SESSION_COOKIE = "nx_session";
var PORTAL_COOKIE = "nx_portal";
var SESSION_DAYS = 30;
var PORTAL_SESSION_HOURS = 12;
function requireAuth() {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw unauthorized();
    const tokenHash = await sha256Hex(token);
    const row = await first(
      c.env.DB,
      `SELECT u.id, u.email, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.active = 1`,
      tokenHash
    );
    if (!row) throw unauthorized("Session expired \u2014 please sign in again");
    if (row.expires_at < (/* @__PURE__ */ new Date()).toISOString()) {
      await run(c.env.DB, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash);
      throw unauthorized("Session expired \u2014 please sign in again");
    }
    const { expires_at: _drop, ...user } = row;
    c.set("user", user);
    await next();
  };
}
__name(requireAuth, "requireAuth");
function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) throw forbidden();
    await next();
  };
}
__name(requireRole, "requireRole");
function requirePortal() {
  return async (c, next) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (!token) throw unauthorized("Your sign-in link has expired \u2014 request a new one");
    const tokenHash = await sha256Hex(token);
    const row = await first(
      c.env.DB,
      `SELECT ct.id, ct.email, ct.first_name, ct.last_name, cs.expires_at
       FROM contact_sessions cs JOIN contacts ct ON ct.id = cs.contact_id
       WHERE cs.token_hash = ? AND ct.anonymized_at IS NULL`,
      tokenHash
    );
    if (!row) throw unauthorized("Your sign-in link has expired \u2014 request a new one");
    if (row.expires_at < (/* @__PURE__ */ new Date()).toISOString()) {
      await run(c.env.DB, `DELETE FROM contact_sessions WHERE token_hash = ?`, tokenHash);
      throw unauthorized("Your sign-in link has expired \u2014 request a new one");
    }
    const { expires_at: _drop, ...contact } = row;
    c.set("contact", contact);
    await next();
  };
}
__name(requirePortal, "requirePortal");

// src/worker/lib/consent.ts
var ALL_PURPOSES = ["data_processing", "mission_alerts", "news"];
var MARKETING_PURPOSES = ["mission_alerts", "news"];
var PURPOSE_LABEL = {
  data_processing: "Store my profile to match me with missions",
  mission_alerts: "Mission alerts",
  news: "Company news"
};
async function recordConsent(env, input) {
  await run(
    env.DB,
    `INSERT INTO consents (id, contact_id, purpose, granted, source, policy_version, ip, user_agent, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(),
    input.contactId,
    input.purpose,
    input.granted ? 1 : 0,
    input.source,
    env.PRIVACY_POLICY_VERSION ?? "",
    input.ip ?? null,
    input.userAgent ?? null,
    input.actor ?? null
  );
  await logActivity(env.DB, {
    contactId: input.contactId,
    kind: input.granted ? "consent_granted" : "consent_revoked",
    summary: `${input.granted ? "Granted" : "Withdrew"} consent: ${PURPOSE_LABEL[input.purpose]}`,
    detail: `source=${input.source} policy=${env.PRIVACY_POLICY_VERSION ?? ""}`
  });
}
__name(recordConsent, "recordConsent");
async function recordConsents(env, contactId, decisions, common) {
  for (const purpose of ALL_PURPOSES) {
    const granted = decisions[purpose];
    if (granted === void 0) continue;
    await recordConsent(env, { ...common, contactId, purpose, granted });
  }
}
__name(recordConsents, "recordConsents");
var NO_CONSENT = {
  data_processing: false,
  mission_alerts: false,
  news: false
};
async function currentConsents(db, contactId) {
  const rows = await all(
    db,
    `SELECT purpose, granted FROM consent_current WHERE contact_id = ?`,
    contactId
  );
  const state = { ...NO_CONSENT };
  for (const row of rows) state[row.purpose] = row.granted === 1;
  return state;
}
__name(currentConsents, "currentConsents");
async function consentsFor(db, contactIds) {
  const map = /* @__PURE__ */ new Map();
  if (!contactIds.length) return map;
  const rows = await selectByChunks(
    db,
    (ph) => `SELECT contact_id, purpose, granted FROM consent_current WHERE contact_id IN (${ph})`,
    contactIds
  );
  for (const id of contactIds) map.set(id, { ...NO_CONSENT });
  for (const row of rows) {
    const state = map.get(row.contact_id);
    if (state) state[row.purpose] = row.granted === 1;
  }
  return map;
}
__name(consentsFor, "consentsFor");
async function consentHistory(db, contactId) {
  return all(
    db,
    `SELECT purpose, granted, source, policy_version, created_at
     FROM consents WHERE contact_id = ? ORDER BY seq DESC`,
    contactId
  );
}
__name(consentHistory, "consentHistory");

// src/worker/lib/csrf.ts
function isCrossSiteRequest(input) {
  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) {
    return site === "cross-site";
  }
  const origin = input.origin?.trim();
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin !== new URL(input.requestUrl).origin;
  } catch {
    return true;
  }
}
__name(isCrossSiteRequest, "isCrossSiteRequest");

// src/worker/lib/suppression.ts
function normaliseEmail(email) {
  return email.trim().toLowerCase();
}
__name(normaliseEmail, "normaliseEmail");
async function emailHash(email) {
  return sha256Hex(normaliseEmail(email));
}
__name(emailHash, "emailHash");
async function linkedinHash(linkedinKey2) {
  return sha256Hex(`li:${linkedinKey2}`);
}
__name(linkedinHash, "linkedinHash");
async function suppressEmail(db, email, reason) {
  if (!email || email.includes("@invalid")) return;
  await storeHash(db, await emailHash(email), reason);
}
__name(suppressEmail, "suppressEmail");
async function suppressLinkedin(db, linkedinKey2, reason) {
  if (!linkedinKey2) return;
  await storeHash(db, await linkedinHash(linkedinKey2), reason);
}
__name(suppressLinkedin, "suppressLinkedin");
async function storeHash(db, hash, reason) {
  await run(
    db,
    `INSERT INTO suppression_list (email_hash, reason) VALUES (?, ?)
     ON CONFLICT(email_hash) DO NOTHING`,
    hash,
    reason.slice(0, 200)
  );
}
__name(storeHash, "storeHash");
async function unsuppressEmail(db, email) {
  await run(db, `DELETE FROM suppression_list WHERE email_hash = ?`, await emailHash(email));
}
__name(unsuppressEmail, "unsuppressEmail");
async function unsuppressLinkedin(db, linkedinKey2) {
  await run(
    db,
    `DELETE FROM suppression_list WHERE email_hash = ?`,
    await linkedinHash(linkedinKey2)
  );
}
__name(unsuppressLinkedin, "unsuppressLinkedin");
async function isSuppressed(db, email) {
  const row = await first(
    db,
    `SELECT email_hash FROM suppression_list WHERE email_hash = ?`,
    await emailHash(email)
  );
  return row !== null;
}
__name(isSuppressed, "isSuppressed");
async function filterSuppressedHashes(db, hashes) {
  const rows = await selectByChunks(
    db,
    (ph) => `SELECT email_hash FROM suppression_list WHERE email_hash IN (${ph})`,
    hashes
  );
  return new Set(rows.map((r) => r.email_hash));
}
__name(filterSuppressedHashes, "filterSuppressedHashes");

// src/worker/lib/suppress.ts
async function suppressContact(env, opts) {
  const identity = await first(
    env.DB,
    `SELECT email, linkedin_key FROM contacts WHERE id = ?`,
    opts.contactId
  );
  if (identity?.email) await suppressEmail(env.DB, identity.email, opts.reason);
  if (identity?.linkedin_key) await suppressLinkedin(env.DB, identity.linkedin_key, opts.reason);
  await run(
    env.DB,
    `UPDATE contacts
       SET suppressed = 1, suppressed_at = datetime('now'), suppressed_reason = ?,
           stage = 'closed', updated_at = datetime('now')
     WHERE id = ?`,
    opts.reason.slice(0, 200),
    opts.contactId
  );
  for (const purpose of MARKETING_PURPOSES) {
    await recordConsent(env, {
      contactId: opts.contactId,
      purpose,
      granted: false,
      source: opts.source,
      actor: opts.actorUserId ?? null
    });
  }
  await logActivity(env.DB, {
    contactId: opts.contactId,
    kind: "suppressed",
    summary: `Marked do-not-contact: ${opts.reason}`,
    actorUserId: opts.actorUserId ?? null
  });
}
__name(suppressContact, "suppressContact");

// src/worker/modules/portal/session.ts
async function startPortalSession(c, contactId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + PORTAL_SESSION_HOURS * 36e5);
  await run(
    c.env.DB,
    `INSERT INTO contact_sessions (token_hash, contact_id, expires_at) VALUES (?, ?, ?)`,
    tokenHash,
    contactId,
    expires.toISOString()
  );
  setCookie(c, PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/",
    maxAge: PORTAL_SESSION_HOURS * 3600
  });
}
__name(startPortalSession, "startPortalSession");
function endPortalSession(c) {
  deleteCookie(c, PORTAL_COOKIE, { path: "/" });
}
__name(endPortalSession, "endPortalSession");
async function revokePortalSessions(db, contactId) {
  await run(db, `DELETE FROM contact_sessions WHERE contact_id = ?`, contactId);
}
__name(revokePortalSessions, "revokePortalSessions");

// src/worker/modules/actions/routes.ts
var actionRoutes = new Hono2();
var expiredPage = /* @__PURE__ */ __name((what) => actionPage({
  title: "Link expired",
  heading: "This link has expired",
  body: `<p>${esc(what)}</p>`,
  action: { label: "Go to the registration page", href: "/join" },
  tone: "warn"
}), "expiredPage");
actionRoutes.get("/:token", async (c) => {
  const raw2 = c.req.param("token");
  const row = await peekActionToken(c.env.DB, raw2);
  if (!row) {
    return c.html(
      expiredPage("Links in our emails are personal and time-limited. You can request a new one."),
      410
    );
  }
  const contact = row.contact_id ? await first(
    c.env.DB,
    `SELECT first_name, email FROM contacts WHERE id = ?`,
    row.contact_id
  ) : null;
  const hello = contact?.first_name ? `Hi ${esc(contact.first_name)},` : "Hello,";
  switch (row.purpose) {
    case "portal_link":
      return c.html(
        actionPage({
          title: "Open your profile",
          heading: "Open your Nexian profile",
          body: `<p>${hello} continue to update your day rate, availability, skills and CV.</p>`,
          action: { label: "Open my profile", method: "post" }
        })
      );
    case "confirm_availability": {
      const profile = row.contact_id ? await first(
        c.env.DB,
        `SELECT availability, available_from, daily_rate FROM profiles WHERE contact_id = ?`,
        row.contact_id
      ) : null;
      return c.html(
        actionPage({
          title: "Confirm your availability",
          heading: "Is this still correct?",
          body: `<p>${hello} we have you as <strong>${esc(availabilityPhrase(profile))}</strong>${profile?.daily_rate ? ` at <strong>\u20AC ${profile.daily_rate}/day</strong>` : ""}.</p>`,
          action: { label: "Yes \u2014 still correct", method: "post" },
          secondary: { label: "Something changed \u2014 update my profile", href: "/join" },
          tone: "good"
        })
      );
    }
    case "unsubscribe": {
      const scope = readScope(row.payload);
      return c.html(
        actionPage({
          title: "Unsubscribe",
          heading: scope === "all" ? "Stop contacting me" : "Unsubscribe",
          body: scope === "all" ? `<p>${hello} confirm and we will not contact you again. Your details are removed from our outreach list.</p>` : `<p>${hello} confirm to stop receiving ${esc(scopeLabel(scope))} from Nexian. Your profile stays as it is.</p>`,
          action: { label: "Confirm", method: "post" },
          tone: "warn"
        })
      );
    }
    case "set_password":
      return c.redirect(`/set-password?token=${encodeURIComponent(raw2)}`, 302);
    default:
      return c.html(expiredPage("Unknown link type."), 400);
  }
});
var POST_PURPOSES = ["portal_link", "confirm_availability", "unsubscribe"];
actionRoutes.post("/:token", async (c) => {
  if (isCrossSiteRequest({
    secFetchSite: c.req.header("sec-fetch-site"),
    origin: c.req.header("origin"),
    requestUrl: c.req.url
  })) {
    return c.html(
      actionPage({
        title: "Open this link directly",
        heading: "Please open the link from your email",
        body: `<p>This action was started by another website, so we stopped it. Open the button in our email directly and it will work normally.</p>`,
        action: { label: "Go to the registration page", href: "/join" },
        tone: "warn"
      }),
      403
    );
  }
  const raw2 = c.req.param("token");
  const peeked = await peekActionToken(c.env.DB, raw2);
  if (!peeked) return c.html(expiredPage("This link has already been used or has expired."), 410);
  const purpose = POST_PURPOSES.find((p) => p === peeked.purpose);
  if (!purpose) return c.html(expiredPage("This link cannot be used here."), 400);
  const row = await consumeActionToken(c.env.DB, raw2, purpose);
  if (!row) return c.html(expiredPage("This link has already been used."), 410);
  switch (purpose) {
    case "portal_link": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      await run(
        c.env.DB,
        `UPDATE profiles SET verified_at = datetime('now')
         WHERE contact_id = ? AND verified_at IS NULL`,
        row.contact_id
      );
      await startPortalSession(c, row.contact_id);
      return c.redirect("/profile", 303);
    }
    case "confirm_availability": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      await run(
        c.env.DB,
        `UPDATE profiles SET last_confirmed_at = datetime('now') WHERE contact_id = ?`,
        row.contact_id
      );
      await logActivity(c.env.DB, {
        contactId: row.contact_id,
        kind: "availability_confirmed",
        summary: "Confirmed availability from the reminder email"
      });
      return c.html(
        actionPage({
          title: "Thank you",
          heading: "Thanks \u2014 you're up to date",
          body: `<p>We have noted that your availability is still correct. Nothing else to do.</p>`,
          secondary: { label: "Change something anyway", href: "/join" },
          tone: "good"
        })
      );
    }
    case "unsubscribe": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      const scope = readScope(row.payload);
      if (scope === "all") {
        await suppressContact(c.env, {
          contactId: row.contact_id,
          reason: "Opted out from an email",
          source: "unsubscribe_link"
        });
        return c.html(
          actionPage({
            title: "Done",
            heading: "You won't hear from us again",
            body: `<p>We've removed you from our outreach list. Sorry for the interruption.</p>`,
            tone: "good"
          })
        );
      }
      await recordConsent(c.env, {
        contactId: row.contact_id,
        purpose: scope,
        granted: false,
        source: "unsubscribe_link"
      });
      return c.html(
        actionPage({
          title: "Unsubscribed",
          heading: "Unsubscribed",
          body: `<p>You will no longer receive ${esc(scopeLabel(scope))}. Your profile and the rest of your preferences are unchanged.</p>`,
          action: { label: "Manage all my preferences", href: "/join" },
          tone: "good"
        })
      );
    }
    default:
      return c.html(expiredPage("Unknown link type."), 400);
  }
});
function readScope(payload) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed.scope === "mission_alerts" || parsed.scope === "news") return parsed.scope;
  } catch {
  }
  return "all";
}
__name(readScope, "readScope");
function scopeLabel(scope) {
  if (scope === "mission_alerts") return "mission alerts";
  if (scope === "news") return "company news";
  return "emails";
}
__name(scopeLabel, "scopeLabel");

// src/worker/lib/accessLog.ts
var ACCESS_ACTIONS = [
  "cv_download",
  "pool_export",
  "contacts_export",
  "access_log_export",
  "contact_view",
  "pool_view"
];
async function recordAccess(db, entry) {
  try {
    await run(
      db,
      `INSERT INTO access_log (id, user_id, user_name, action, contact_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uid(),
      entry.userId,
      entry.userName,
      entry.action,
      entry.contactId ?? null,
      entry.detail ?? null,
      entry.ip ?? null
    );
  } catch (e) {
    log.error("access_log.write_failed", {
      action: entry.action,
      user: entry.userId,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}
__name(recordAccess, "recordAccess");
var ACCESS_LABEL = {
  cv_download: "Downloaded a CV",
  pool_export: "Exported the talent pool",
  contacts_export: "Exported the contact list",
  access_log_export: "Exported this access log",
  contact_view: "Opened a freelancer's record",
  pool_view: "Browsed the talent pool"
};

// src/worker/lib/csv.ts
function detectDelimiter(sample) {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ",") commas++;
    else if (!inQuotes && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}
__name(detectDelimiter, "detectDelimiter");
function parseCsv(text, delimiter) {
  const clean = text.replace(/^﻿/, "");
  const delim = delimiter ?? detectDelimiter(clean);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}
__name(parseCsv, "parseCsv");
var HEADER_ALIASES = {
  email: ["email", "email address", "e-mail", "emailaddress", "mail", "e-mailadres"],
  first_name: ["first name", "firstname", "first", "voornaam", "pr\xE9nom", "prenom"],
  last_name: ["last name", "lastname", "last", "surname", "achternaam", "nom"],
  phone: ["phone", "phone number", "mobile", "telefoon", "gsm", "t\xE9l\xE9phone"],
  linkedin_url: ["linkedin", "linkedin url", "profile url", "url", "public profile url"],
  source_note: ["note", "notes", "source", "company", "position", "headline"]
};
function normaliseHeader(raw2) {
  const key = raw2.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}
__name(normaliseHeader, "normaliseHeader");
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
function isValidEmail(value) {
  return EMAIL_RE.test(value.trim());
}
__name(isValidEmail, "isValidEmail");
function mapImportRows(table, keyOf = () => null) {
  const skipped = [];
  const warnings = [];
  if (!table.length) return { rows: [], skipped, warnings, unmappedHeaders: [] };
  const header = table[0];
  const mapping = header.map(normaliseHeader);
  const unmappedHeaders = header.filter((h, i) => h.trim() !== "" && mapping[i] === null);
  if (!mapping.includes("email") && !mapping.includes("linkedin_url")) {
    return {
      rows: [],
      skipped: [
        {
          line: 1,
          reason: "No email or LinkedIn column found \u2014 add a column headed 'Email' or 'LinkedIn'."
        }
      ],
      warnings,
      unmappedHeaders
    };
  }
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const rec = {};
    mapping.forEach((field, i) => {
      if (field) rec[field] = (cells[i] ?? "").trim();
    });
    const rawEmail = (rec.email ?? "").toLowerCase();
    const email = isValidEmail(rawEmail) ? rawEmail : void 0;
    const linkedinUrl = rec.linkedin_url || void 0;
    const linkedinKey2 = linkedinUrl ? keyOf(linkedinUrl) ?? void 0 : void 0;
    if (!email && !linkedinKey2) {
      skipped.push({
        line: r + 1,
        reason: rawEmail ? `Not a valid email address (${rawEmail}) and no usable LinkedIn URL` : "No email address and no usable LinkedIn URL"
      });
      continue;
    }
    if (rawEmail && !email) {
      warnings.push({
        line: r + 1,
        note: `Email looked invalid (${rawEmail}) \u2014 imported with LinkedIn only`
      });
    }
    if (linkedinUrl && !linkedinKey2) {
      warnings.push({
        line: r + 1,
        note: `Could not read the LinkedIn URL (${linkedinUrl.slice(0, 60)}) \u2014 kept the email only`
      });
    }
    const identities = [email, linkedinKey2 && `li:${linkedinKey2}`].filter(
      (v) => Boolean(v)
    );
    if (identities.some((k) => seen.has(k))) {
      skipped.push({
        line: r + 1,
        reason: `Duplicate of an earlier row: ${email ?? linkedinUrl}`
      });
      continue;
    }
    for (const k of identities) seen.add(k);
    rows.push({
      email,
      first_name: rec.first_name ?? "",
      last_name: rec.last_name ?? "",
      phone: rec.phone || void 0,
      linkedin_url: linkedinUrl,
      linkedin_key: linkedinKey2,
      source_note: rec.source_note || void 0
    });
  }
  return { rows, skipped, warnings, unmappedHeaders };
}
__name(mapImportRows, "mapImportRows");
function csvCell(value) {
  const raw2 = value === null || value === void 0 ? "" : String(value);
  const s = /^[=+\-@\t\r]/.test(raw2) ? `'${raw2}` : raw2;
  return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
__name(csvCell, "csvCell");
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}
__name(toCsv, "toCsv");

// src/worker/modules/admin/routes.ts
var adminRoutes = new Hono2();
adminRoutes.use("*", requireAuth(), requireRole("admin"));
adminRoutes.get("/users", async (c) => {
  const users = await all(
    c.env.DB,
    `SELECT id, email, name, role, active, created_at,
            CASE WHEN pw_hash IS NULL THEN 0 ELSE 1 END AS has_password
     FROM users ORDER BY created_at`
  );
  return c.json({ users });
});
adminRoutes.post("/users", async (c) => {
  const input = external_exports.object({
    email: external_exports.string().email(),
    name: external_exports.string().trim().min(1).max(120),
    role: external_exports.enum(["admin", "recruiter"]).default("recruiter")
  }).parse(await c.req.json());
  const email = input.email.trim().toLowerCase();
  const clash = await first(
    c.env.DB,
    `SELECT id FROM users WHERE email = ?`,
    email
  );
  if (clash) throw badRequest("Someone already has that email address.", "duplicate");
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`,
    id,
    email,
    input.name,
    input.role
  );
  const baseUrl = await resolveBaseUrl(c.env);
  const token = await createActionToken(c.env.DB, { purpose: "set_password", userId: id });
  const mail = setPasswordEmail(
    { companyName: c.env.COMPANY_NAME, baseUrl },
    { name: input.name, url: `${baseUrl}/set-password?token=${token}` }
  );
  const sent = await sendEmail(c.env, {
    to: email,
    subject: mail.subject,
    html: mail.html,
    template: "set_password"
  });
  return c.json({
    ok: true,
    id,
    invitationSent: sent,
    setPasswordUrl: sent ? void 0 : `${baseUrl}/set-password?token=${token}`
  });
});
adminRoutes.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const input = external_exports.object({
    name: external_exports.string().trim().min(1).max(120).optional(),
    role: external_exports.enum(["admin", "recruiter"]).optional(),
    active: external_exports.boolean().optional()
  }).parse(await c.req.json());
  if (input.active === false || input.role === "recruiter") {
    const others = await first(
      c.env.DB,
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?`,
      id
    );
    const target = await first(
      c.env.DB,
      `SELECT role FROM users WHERE id = ?`,
      id
    );
    if (target?.role === "admin" && (others?.n ?? 0) === 0) {
      throw badRequest("This is the last active admin \u2014 promote someone else first.", "last_admin");
    }
  }
  const fields = [];
  const params = [];
  if (input.name !== void 0) {
    fields.push("name = ?");
    params.push(input.name);
  }
  if (input.role !== void 0) {
    fields.push("role = ?");
    params.push(input.role);
  }
  if (input.active !== void 0) {
    fields.push("active = ?");
    params.push(input.active ? 1 : 0);
  }
  if (!fields.length) return c.json({ ok: true });
  await run(c.env.DB, `UPDATE users SET ${fields.join(", ")} WHERE id = ?`, ...params, id);
  if (input.active === false) {
    await run(c.env.DB, `DELETE FROM sessions WHERE user_id = ?`, id);
  }
  return c.json({ ok: true });
});
adminRoutes.get("/taxonomy", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT id, kind, label, sort, active FROM taxonomy ORDER BY kind, sort, label`
  );
  return c.json({ taxonomy: rows });
});
adminRoutes.post("/taxonomy", async (c) => {
  const input = external_exports.object({
    kind: external_exports.enum(["skill", "industry", "language"]),
    label: external_exports.string().trim().min(1).max(80),
    sort: external_exports.number().int().min(0).max(9999).default(500)
  }).parse(await c.req.json());
  const id = uid();
  try {
    await run(
      c.env.DB,
      `INSERT INTO taxonomy (id, kind, label, sort) VALUES (?, ?, ?, ?)`,
      id,
      input.kind,
      input.label,
      input.sort
    );
  } catch {
    throw badRequest(`\u201C${input.label}\u201D is already in the ${input.kind} list.`, "duplicate");
  }
  return c.json({ ok: true, id });
});
adminRoutes.patch("/taxonomy/:id", async (c) => {
  const input = external_exports.object({
    label: external_exports.string().trim().min(1).max(80).optional(),
    sort: external_exports.number().int().min(0).max(9999).optional(),
    active: external_exports.boolean().optional()
  }).parse(await c.req.json());
  const fields = [];
  const params = [];
  if (input.label !== void 0) {
    fields.push("label = ?");
    params.push(input.label);
  }
  if (input.sort !== void 0) {
    fields.push("sort = ?");
    params.push(input.sort);
  }
  if (input.active !== void 0) {
    fields.push("active = ?");
    params.push(input.active ? 1 : 0);
  }
  if (!fields.length) return c.json({ ok: true });
  const res = await run(
    c.env.DB,
    `UPDATE taxonomy SET ${fields.join(", ")} WHERE id = ?`,
    ...params,
    c.req.param("id")
  );
  if (!res.meta.changes) throw notFound("No such entry");
  return c.json({ ok: true });
});
adminRoutes.get("/retention/preview", async (c) => {
  const candidates = await findExpiredProspects(c.env);
  return c.json({
    retentionDays: Number(c.env.PROSPECT_RETENTION_DAYS),
    count: candidates.length,
    sample: candidates.slice(0, 20).map((x) => ({ email: x.email, added: x.created_at }))
  });
});
adminRoutes.post("/retention/run", async (c) => {
  const count = await runRetentionSweep(c.env);
  return c.json({ ok: true, anonymised: count });
});
adminRoutes.get("/suppression", async (c) => {
  const row = await first(c.env.DB, `SELECT COUNT(*) AS n FROM suppression_list`);
  const recent = await all(
    c.env.DB,
    `SELECT reason, created_at FROM suppression_list ORDER BY created_at DESC LIMIT 20`
  );
  return c.json({ total: row?.n ?? 0, recent });
});
adminRoutes.get("/email-log", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT to_email, template, subject, status, error, created_at
     FROM email_log ORDER BY created_at DESC LIMIT 200`
  );
  return c.json({ emails: rows });
});
async function queryAccessLog(c, limit) {
  const q = c.req.query();
  const where = [];
  const params = [];
  if (q.contactId) {
    where.push("a.contact_id = ?");
    params.push(q.contactId);
  }
  if (q.userId) {
    where.push("a.user_id = ?");
    params.push(q.userId);
  }
  if (q.action && ACCESS_ACTIONS.includes(q.action)) {
    where.push("a.action = ?");
    params.push(q.action);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "")) {
    where.push("a.created_at >= ?");
    params.push(`${q.from} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "")) {
    where.push("a.created_at <= ?");
    params.push(`${q.to} 23:59:59`);
  }
  return all(
    c.env.DB,
    `SELECT a.id, a.user_id, a.user_name, a.action, a.contact_id, a.detail, a.ip, a.created_at,
            ct.first_name, ct.last_name
     FROM access_log a
     LEFT JOIN contacts ct ON ct.id = a.contact_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC LIMIT ?`,
    ...params,
    limit
  );
}
__name(queryAccessLog, "queryAccessLog");
function whoseRecord(row) {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  if (name) return name;
  return row.contact_id ? "(deleted record)" : "";
}
__name(whoseRecord, "whoseRecord");
adminRoutes.get("/access-log", async (c) => {
  const rows = await queryAccessLog(c, 300);
  const summary = await first(
    c.env.DB,
    `SELECT
       SUM(CASE WHEN action = 'cv_download' THEN 1 ELSE 0 END) AS downloads,
       SUM(CASE WHEN action IN ('pool_export','contacts_export') THEN 1 ELSE 0 END) AS exports,
       COUNT(DISTINCT user_id) AS people
     FROM access_log WHERE created_at > datetime('now', '-30 days')`
  );
  const staff = await all(
    c.env.DB,
    `SELECT DISTINCT user_id, user_name FROM access_log
     WHERE user_id IS NOT NULL ORDER BY user_name`
  );
  return c.json({
    entries: rows.map((r) => ({
      ...r,
      label: ACCESS_LABEL[r.action],
      whose: whoseRecord(r)
    })),
    staff,
    last30Days: {
      cvDownloads: summary?.downloads ?? 0,
      bulkExports: summary?.exports ?? 0,
      staffActive: summary?.people ?? 0
    }
  });
});
adminRoutes.get("/access-log/export/csv", async (c) => {
  const rows = await queryAccessLog(c, 1e4);
  const csv = toCsv(
    ["When (UTC)", "Who", "What", "Whose record", "Detail", "IP"],
    rows.map((r) => [
      r.created_at,
      r.user_name || "(removed user)",
      ACCESS_LABEL[r.action],
      whoseRecord(r),
      r.detail ?? "",
      r.ip ?? ""
    ])
  );
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "access_log_export",
    detail: `${rows.length} entries`,
    ip: clientIp(c.req.raw.headers)
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-access-log.csv"`
    }
  });
});
adminRoutes.get("/preview/email", async (c) => {
  const template = c.req.query("template") ?? "invite";
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  const sample = {
    firstName: "Sofie",
    senderName: "Laurent Thierry",
    registerUrl: `${baseUrl}/join`,
    optOutUrl: `${baseUrl}/join#preview-only`,
    portalUrl: `${baseUrl}/join#preview-only`,
    unsubscribeUrl: `${baseUrl}/join#preview-only`
  };
  let rendered;
  switch (template) {
    case "invite":
      rendered = inviteEmail(ctx, { ...sample, source: "linkedin" });
      break;
    case "followup":
      rendered = followUpEmail(ctx, sample);
      break;
    case "welcome":
      rendered = welcomeEmail(ctx, {
        firstName: sample.firstName,
        portalUrl: sample.portalUrl,
        consentSummary: ["Store my profile to match me with missions", "Mission alerts"]
      });
      break;
    case "reminder":
      rendered = availabilityReminderEmail(ctx, {
        firstName: sample.firstName,
        availabilityLine: "you are available from 1 September 2026",
        confirmUrl: sample.portalUrl,
        portalUrl: sample.portalUrl,
        unsubscribeUrl: sample.unsubscribeUrl
      });
      break;
    default:
      throw badRequest("Unknown template \u2014 use invite, followup, welcome or reminder.");
  }
  return c.json(rendered);
});
adminRoutes.get("/alerts", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT id, kind, severity, summary, detail, user_name, emailed, acknowledged_at, created_at
     FROM alerts ORDER BY acknowledged_at IS NOT NULL, created_at DESC LIMIT 100`
  );
  const open = rows.filter((r) => r.acknowledged_at === null).length;
  return c.json({ alerts: rows, open });
});
adminRoutes.post("/alerts/:id/acknowledge", async (c) => {
  const user = c.get("user");
  const res = await run(
    c.env.DB,
    `UPDATE alerts SET acknowledged_at = datetime('now'), acknowledged_by = ?
     WHERE id = ? AND acknowledged_at IS NULL`,
    user.name,
    c.req.param("id")
  );
  if (!res.meta.changes) throw notFound("No such open alert");
  return c.json({ ok: true });
});

// src/worker/lib/mfa.ts
var MFA_CODE_TTL_MINUTES = 10;
var MFA_MAX_ATTEMPTS = 5;
var MFA_CODE_LENGTH = 6;
function mfaActive(env) {
  return Boolean(env.RESEND_API_KEY);
}
__name(mfaActive, "mfaActive");
function generateCode(randomValues = (a) => crypto.getRandomValues(a)) {
  const limit = 1e6;
  const ceiling = Math.floor(4294967295 / limit) * limit;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    value = randomValues(buf)[0];
  } while (value >= ceiling);
  return String(value % limit).padStart(MFA_CODE_LENGTH, "0");
}
__name(generateCode, "generateCode");
function hashCode(challengeId, code) {
  return sha256Hex(`${challengeId}:${code}`);
}
__name(hashCode, "hashCode");
async function verifyChallenge(challengeId, challenge, submittedCode, now = /* @__PURE__ */ new Date()) {
  if (challenge.consumed_at) return { ok: false, reason: "consumed", attemptsLeft: 0 };
  if (challenge.expires_at < now.toISOString()) {
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked", attemptsLeft: 0 };
  }
  const submitted = submittedCode.trim();
  const attemptsLeft = MFA_MAX_ATTEMPTS - challenge.attempts - 1;
  if (!new RegExp(`^\\d{${MFA_CODE_LENGTH}}$`).test(submitted)) {
    return { ok: false, reason: "wrong", attemptsLeft };
  }
  const expected = await hashCode(challengeId, submitted);
  if (!timingSafeEqual(expected, challenge.code_hash)) {
    return { ok: false, reason: "wrong", attemptsLeft };
  }
  return { ok: true };
}
__name(verifyChallenge, "verifyChallenge");
function verdictMessage(verdict) {
  switch (verdict.reason) {
    case "expired":
      return "That code has expired. Sign in again to get a new one.";
    case "consumed":
      return "That code has already been used. Sign in again to get a new one.";
    case "locked":
      return "Too many incorrect codes. Sign in again to get a new one.";
    case "wrong":
      return verdict.attemptsLeft > 0 ? `That code is not correct. ${verdict.attemptsLeft} attempt${verdict.attemptsLeft === 1 ? "" : "s"} left.` : "Too many incorrect codes. Sign in again to get a new one.";
  }
}
__name(verdictMessage, "verdictMessage");
function challengeExpiry(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + MFA_CODE_TTL_MINUTES * 6e4).toISOString();
}
__name(challengeExpiry, "challengeExpiry");

// src/worker/modules/auth/routes.ts
var authRoutes = new Hono2();
var loginSchema = external_exports.object({
  email: external_exports.string().email(),
  password: external_exports.string().min(1)
});
async function startSession(c, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await run(
    c.env.DB,
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    tokenHash,
    userId,
    expires.toISOString()
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400
  });
}
__name(startSession, "startSession");
authRoutes.post("/bootstrap", async (c) => {
  const body = await c.req.json();
  if (!c.env.SETUP_KEY) throw forbidden("Bootstrap is disabled: SETUP_KEY is not configured");
  const ip = clientIp(c.req.raw.headers);
  const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, `bootstrap:${ip}`);
  if (!check.allowed) throw tooManyRequests("Too many attempts. Please wait and try again.");
  if (!timingSafeEqual(body.key ?? "", c.env.SETUP_KEY)) throw forbidden("Invalid setup key");
  const existing = await first(c.env.DB, `SELECT COUNT(*) AS n FROM users`);
  if ((existing?.n ?? 0) > 0) throw forbidden("Already initialised \u2014 sign in instead");
  const parsed = external_exports.object({ email: external_exports.string().email(), name: external_exports.string().min(1), password: external_exports.string().min(10) }).parse(body);
  const { hash, salt } = await hashPassword(parsed.password);
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO users (id, email, name, role, pw_hash, pw_salt) VALUES (?, ?, ?, 'admin', ?, ?)`,
    id,
    parsed.email.toLowerCase(),
    parsed.name,
    hash,
    salt
  );
  log.info("auth.bootstrap", { user: id });
  await startSession(c, id);
  return c.json({ ok: true });
});
authRoutes.post("/login", async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  const ip = clientIp(c.req.raw.headers);
  for (const identifier of [`ip:${ip}`, `email:${email.toLowerCase()}`]) {
    const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, identifier);
    if (!check.allowed) {
      log.warn("auth.rate_limited", { identifier: identifier.split(":")[0], ip });
      throw tooManyRequests(
        `Too many sign-in attempts. Please wait ${Math.ceil(check.retryAfterSeconds / 60)} minutes and try again.`
      );
    }
  }
  const user = await first(
    c.env.DB,
    `SELECT id, name, email, pw_hash, pw_salt FROM users WHERE email = ? AND active = 1`,
    email.toLowerCase()
  );
  const generic = unauthorized("Wrong email or password");
  if (!user?.pw_hash || !user.pw_salt) throw generic;
  if (!await verifyPassword(password, user.pw_salt, user.pw_hash)) throw generic;
  if (mfaActive(c.env)) {
    const challengeId = await issueChallenge(c, user);
    log.info("auth.mfa_challenged", { user: user.id });
    return c.json({ ok: true, mfaRequired: true, challengeId });
  }
  await startSession(c, user.id);
  log.warn("auth.login_without_second_factor", { user: user.id, reason: "email_not_configured" });
  return c.json({ ok: true, mfaRequired: false, mfaActive: false });
});
async function issueChallenge(c, user) {
  const challengeId = randomToken(24);
  const code = generateCode();
  const baseUrl = await resolveBaseUrl(c.env);
  await run(
    c.env.DB,
    `INSERT INTO login_challenges (id, user_id, code_hash, expires_at, ip) VALUES (?, ?, ?, ?, ?)`,
    challengeId,
    user.id,
    await hashCode(challengeId, code),
    challengeExpiry(),
    clientIp(c.req.raw.headers)
  );
  const mail = signInCodeEmail(
    { companyName: c.env.COMPANY_NAME, baseUrl },
    { name: user.name, code, minutes: MFA_CODE_TTL_MINUTES }
  );
  await sendEmail(c.env, {
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    template: "sign_in_code"
  });
  return challengeId;
}
__name(issueChallenge, "issueChallenge");
authRoutes.post("/verify-code", async (c) => {
  const { challengeId, code } = external_exports.object({ challengeId: external_exports.string().min(1).max(100), code: external_exports.string().min(1).max(20) }).parse(await c.req.json());
  const ip = clientIp(c.req.raw.headers);
  const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, `mfa:${ip}`);
  if (!check.allowed) {
    throw tooManyRequests(
      `Too many attempts. Please wait ${Math.ceil(check.retryAfterSeconds / 60)} minutes and try again.`
    );
  }
  const challenge = await first(
    c.env.DB,
    `SELECT user_id, code_hash, attempts, expires_at, consumed_at FROM login_challenges WHERE id = ?`,
    challengeId
  );
  if (!challenge) throw unauthorized("That code has expired. Sign in again to get a new one.");
  const verdict = await verifyChallenge(challengeId, challenge, code);
  if (!verdict.ok) {
    await run(
      c.env.DB,
      `UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?`,
      challengeId
    );
    log.warn("auth.mfa_failed", { user: challenge.user_id, reason: verdict.reason });
    throw unauthorized(verdictMessage(verdict));
  }
  const spend = await run(
    c.env.DB,
    `UPDATE login_challenges SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL`,
    challengeId
  );
  if (!spend.meta.changes) {
    throw unauthorized("That code has already been used. Sign in again to get a new one.");
  }
  await startSession(c, challenge.user_id);
  log.info("auth.login", { user: challenge.user_id, secondFactor: true });
  return c.json({ ok: true });
});
authRoutes.post("/logout", async (c) => {
  const raw2 = c.req.header("cookie") ?? "";
  const match2 = /(?:^|;\s*)nx_session=([^;]+)/.exec(raw2);
  if (match2?.[1]) {
    await run(c.env.DB, `DELETE FROM sessions WHERE token_hash = ?`, await sha256Hex(match2[1]));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
authRoutes.get("/state", async (c) => {
  const row = await first(c.env.DB, `SELECT COUNT(*) AS n FROM users`);
  return c.json({
    needsBootstrap: (row?.n ?? 0) === 0,
    mfaActive: mfaActive(c.env)
  });
});
authRoutes.get("/me", requireAuth(), (c) => c.json(c.get("user")));
authRoutes.post("/set-password", async (c) => {
  const { token, password } = external_exports.object({ token: external_exports.string().min(1), password: external_exports.string().min(10) }).parse(await c.req.json());
  const row = await consumeActionToken(c.env.DB, token, "set_password");
  if (!row?.user_id) throw badRequest("That link is no longer valid \u2014 ask an admin for a new one");
  const { hash, salt } = await hashPassword(password);
  await run(
    c.env.DB,
    `UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?`,
    hash,
    salt,
    row.user_id
  );
  await startSession(c, row.user_id);
  return c.json({ ok: true });
});
authRoutes.post("/change-password", requireAuth(), async (c) => {
  const { current, next } = external_exports.object({ current: external_exports.string().min(1), next: external_exports.string().min(10) }).parse(await c.req.json());
  const me = c.get("user");
  const row = await first(
    c.env.DB,
    `SELECT pw_hash, pw_salt FROM users WHERE id = ?`,
    me.id
  );
  if (!row?.pw_hash || !row.pw_salt) throw badRequest("No password set on this account");
  if (!await verifyPassword(current, row.pw_salt, row.pw_hash)) {
    throw badRequest("Your current password is not correct");
  }
  const { hash, salt } = await hashPassword(next);
  await run(c.env.DB, `UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?`, hash, salt, me.id);
  const activeToken = getCookie(c, SESSION_COOKIE);
  await run(
    c.env.DB,
    `DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`,
    me.id,
    activeToken ? await sha256Hex(activeToken) : ""
  );
  log.info("auth.password_changed", { user: me.id });
  return c.json({ ok: true });
});

// src/worker/lib/segment.ts
function jsonArrayAnyOf(column, values, frag) {
  const clauses = values.map(() => `${column} LIKE '%"' || ? || '"%'`);
  frag.where.push(`(${clauses.join(" OR ")})`);
  frag.params.push(...values);
}
__name(jsonArrayAnyOf, "jsonArrayAnyOf");
function cleanList(values) {
  return (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
}
__name(cleanList, "cleanList");
function buildPoolFilter(segment, today = /* @__PURE__ */ new Date()) {
  const frag = { where: [], params: [] };
  frag.where.push("ct.suppressed = 0");
  frag.where.push("ct.anonymized_at IS NULL");
  const skills = cleanList(segment.skills);
  if (skills.length) jsonArrayAnyOf("p.skills", skills, frag);
  const industries = cleanList(segment.industries);
  if (industries.length) jsonArrayAnyOf("p.industries", industries, frag);
  const languages = cleanList(segment.languages);
  if (languages.length) jsonArrayAnyOf("p.languages", languages, frag);
  const mobility = cleanList(segment.mobility);
  if (mobility.length) jsonArrayAnyOf("p.mobility", mobility, frag);
  const workRegime = cleanList(segment.workRegime);
  if (workRegime.length) jsonArrayAnyOf("p.work_regime", workRegime, frag);
  const availability = cleanList(segment.availability);
  if (availability.length) {
    frag.where.push(`p.availability IN (${availability.map(() => "?").join(", ")})`);
    frag.params.push(...availability);
  }
  if (typeof segment.availableWithinDays === "number" && segment.availableWithinDays >= 0) {
    const cutoff = new Date(today.getTime() + segment.availableWithinDays * 864e5).toISOString().slice(0, 10);
    frag.where.push(
      `(p.availability = 'now' OR (p.availability = 'from_date' AND p.available_from IS NOT NULL AND p.available_from <= ?))`
    );
    frag.params.push(cutoff);
  }
  if (typeof segment.rateMin === "number") {
    frag.where.push("p.daily_rate IS NOT NULL AND p.daily_rate >= ?");
    frag.params.push(segment.rateMin);
  }
  if (typeof segment.rateMax === "number") {
    frag.where.push("p.daily_rate IS NOT NULL AND p.daily_rate <= ?");
    frag.params.push(segment.rateMax);
  }
  if (typeof segment.minYears === "number") {
    frag.where.push("p.years_experience IS NOT NULL AND p.years_experience >= ?");
    frag.params.push(segment.minYears);
  }
  const stages = cleanList(segment.stages);
  if (stages.length) {
    frag.where.push(`ct.stage IN (${stages.map(() => "?").join(", ")})`);
    frag.params.push(...stages);
  }
  if (typeof segment.staleDays === "number" && segment.staleDays > 0) {
    const cutoff = new Date(today.getTime() - segment.staleDays * 864e5).toISOString();
    frag.where.push("COALESCE(p.last_confirmed_at, p.updated_at) < ?");
    frag.params.push(cutoff);
  }
  const search = (segment.search ?? "").trim();
  if (search) {
    frag.where.push(
      "(ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ? OR p.headline LIKE ?)"
    );
    const like = `%${search}%`;
    frag.params.push(like, like, like, like);
  }
  return frag;
}
__name(buildPoolFilter, "buildPoolFilter");
function whereClause(frag) {
  return frag.where.length ? `WHERE ${frag.where.join(" AND ")}` : "";
}
__name(whereClause, "whereClause");
function buildAudienceQuery(segment, purpose, today = /* @__PURE__ */ new Date()) {
  const frag = buildPoolFilter(segment, today);
  frag.where.push("p.verified_at IS NOT NULL");
  const sql = `
    SELECT ct.id, ct.email, ct.first_name, ct.last_name
    FROM contacts ct
    JOIN profiles p ON p.contact_id = ct.id
    JOIN consent_current cc
      ON cc.contact_id = ct.id AND cc.purpose = ? AND cc.granted = 1
    ${whereClause(frag)}
    ${frag.where.length ? "AND" : "WHERE"} ${EMAILABLE_SQL}
    ORDER BY ct.last_name, ct.first_name
  `;
  return { sql, params: [purpose, ...frag.params] };
}
__name(buildAudienceQuery, "buildAudienceQuery");

// src/worker/modules/campaigns/routes.ts
var campaignRoutes = new Hono2();
campaignRoutes.use("*", requireAuth());
var segmentSchema = external_exports.object({
  skills: external_exports.array(external_exports.string()).optional(),
  industries: external_exports.array(external_exports.string()).optional(),
  languages: external_exports.array(external_exports.string()).optional(),
  availability: external_exports.array(external_exports.enum(["now", "from_date", "not_available", "unknown"])).optional(),
  availableWithinDays: external_exports.number().int().min(0).max(3650).optional(),
  rateMin: external_exports.number().int().min(0).optional(),
  rateMax: external_exports.number().int().min(0).optional(),
  minYears: external_exports.number().int().min(0).max(70).optional(),
  stages: external_exports.array(external_exports.enum(["prospect", "contacted", "registered", "vetted", "on_mission", "closed"])).optional(),
  staleDays: external_exports.number().int().min(0).max(3650).optional(),
  search: external_exports.string().optional()
}).default({});
var campaignSchema = external_exports.object({
  name: external_exports.string().trim().min(1).max(120),
  subject: external_exports.string().trim().min(1).max(200),
  body: external_exports.string().trim().min(1).max(2e4),
  purpose: external_exports.enum(["mission_alerts", "news"]),
  segment: segmentSchema
});
async function loadAudience(db, segment, purpose) {
  const { sql, params } = buildAudienceQuery(segment, purpose);
  return all(db, sql, ...params);
}
__name(loadAudience, "loadAudience");
campaignRoutes.get("/", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT c.id, c.name, c.subject, c.purpose, c.status, c.created_at, c.sent_at,
            c.sent_count, c.failed_count, u.name AS created_by_name
     FROM campaigns c LEFT JOIN users u ON u.id = c.created_by
     ORDER BY c.created_at DESC LIMIT 100`
  );
  return c.json({ campaigns: rows });
});
campaignRoutes.post("/preview", async (c) => {
  const { segment, purpose } = external_exports.object({ segment: segmentSchema, purpose: external_exports.enum(["mission_alerts", "news"]) }).parse(await c.req.json());
  const audience = await loadAudience(c.env.DB, segment, purpose);
  const frag = buildPoolFilter(segment);
  const matching = await first(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct JOIN profiles p ON p.contact_id = ct.id ${whereClause(frag)}`,
    ...frag.params
  );
  return c.json({
    eligible: audience.length,
    matchingSegment: matching?.n ?? audience.length,
    excludedForConsent: Math.max((matching?.n ?? 0) - audience.length, 0),
    sample: audience.slice(0, 10).map((a) => ({
      name: `${a.first_name} ${a.last_name}`.trim(),
      email: a.email
    }))
  });
});
campaignRoutes.post("/", async (c) => {
  const input = campaignSchema.parse(await c.req.json());
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO campaigns (id, name, subject, body, purpose, segment, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.subject,
    input.body,
    input.purpose,
    JSON.stringify(input.segment),
    c.get("user").id
  );
  return c.json({ ok: true, id });
});
campaignRoutes.get("/:id", async (c) => {
  const row = await first(
    c.env.DB,
    `SELECT * FROM campaigns WHERE id = ?`,
    c.req.param("id")
  );
  if (!row) throw notFound("No such campaign");
  const recipients = await all(
    c.env.DB,
    `SELECT cr.status, cr.error, cr.sent_at, ct.email, ct.first_name, ct.last_name
     FROM campaign_recipients cr JOIN contacts ct ON ct.id = cr.contact_id
     WHERE cr.campaign_id = ? ORDER BY cr.sent_at DESC LIMIT 500`,
    c.req.param("id")
  );
  return c.json({
    campaign: { ...row, segment: JSON.parse(String(row.segment ?? "{}")) },
    recipients
  });
});
var MAX_SENDS_PER_REQUEST = 40;
campaignRoutes.post("/:id/send", async (c) => {
  const id = c.req.param("id");
  const campaign = await first(c.env.DB, `SELECT * FROM campaigns WHERE id = ?`, id);
  if (!campaign) throw notFound("No such campaign");
  if (campaign.status === "sent") throw conflict("This campaign has already been sent.");
  const claim = await run(
    c.env.DB,
    `UPDATE campaigns SET status = 'sending' WHERE id = ? AND status = ?`,
    id,
    campaign.status
  );
  if (!claim.meta.changes) throw conflict("Somebody else is sending this campaign right now.");
  const segment = JSON.parse(campaign.segment || "{}");
  const audience = await loadAudience(c.env.DB, segment, campaign.purpose);
  if (!audience.length) {
    await run(c.env.DB, `UPDATE campaigns SET status = 'draft' WHERE id = ?`, id);
    throw badRequest(
      "Nobody in this segment has agreed to receive these emails, so there is nothing to send.",
      "empty_audience"
    );
  }
  const alreadySent = new Set(
    (await all(
      c.env.DB,
      `SELECT contact_id FROM campaign_recipients WHERE campaign_id = ? AND status = 'sent'`,
      id
    )).map((r) => r.contact_id)
  );
  const pending = audience.filter((person) => !alreadySent.has(person.id));
  const batch = pending.slice(0, MAX_SENDS_PER_REQUEST);
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  let sent = 0;
  let failed = 0;
  for (const person of batch) {
    const unsubToken = await createActionToken(c.env.DB, {
      purpose: "unsubscribe",
      contactId: person.id,
      payload: { scope: campaign.purpose }
    });
    const portalToken = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: person.id
    });
    const mail = campaignEmail(ctx, {
      firstName: person.first_name,
      subject: campaign.subject,
      body: campaign.body,
      portalUrl: `${baseUrl}/a/${portalToken}`,
      unsubscribeUrl: `${baseUrl}/a/${unsubToken}`
    });
    const ok = await sendEmail(c.env, {
      to: person.email,
      subject: mail.subject,
      html: mail.html,
      template: `campaign:${campaign.purpose}`,
      contactId: person.id,
      campaignId: campaign.id
    });
    if (ok) sent++;
    else failed++;
    await run(
      c.env.DB,
      `INSERT INTO campaign_recipients (campaign_id, contact_id, status, error)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign_id, contact_id) DO UPDATE SET status = excluded.status`,
      campaign.id,
      person.id,
      ok ? "sent" : "failed",
      ok ? null : "Send failed \u2014 see the email log"
    );
    await logActivity(c.env.DB, {
      contactId: person.id,
      kind: ok ? "email_sent" : "email_failed",
      channel: "email",
      summary: `${ok ? "Received" : "Failed to receive"} campaign "${campaign.name}"`,
      actorUserId: c.get("user").id
    });
  }
  const remaining = pending.length - batch.length;
  await run(
    c.env.DB,
    `UPDATE campaigns
       SET status = ?, sent_at = datetime('now'),
           sent_count = sent_count + ?, failed_count = ?
     WHERE id = ?`,
    remaining > 0 ? "sending" : "sent",
    sent,
    failed,
    id
  );
  log.info("campaign.sent", { campaign: id, sent, failed, remaining });
  return c.json({ ok: true, sent, failed, remaining });
});

// src/worker/lib/alerts.ts
var ALERT_THROTTLE_MINUTES = 60;
var DEFAULT_EXPORT_THRESHOLDS = { rows: 100, perDay: 3 };
function assessExport(event, thresholds = DEFAULT_EXPORT_THRESHOLDS) {
  const who = event.userName || "A staff member";
  const what = event.action === "pool_export" ? "the talent pool" : event.action === "contacts_export" ? "the contact list" : "the access log";
  if (event.recentExports >= thresholds.perDay) {
    return {
      kind: "repeated_export",
      severity: "critical",
      summary: `${who} has exported data ${event.recentExports} times today`,
      detail: `Most recent: ${what}, ${event.rowCount} records. Repeated bulk exports by one person in a single day are unusual \u2014 worth confirming it was expected.`
    };
  }
  if (event.rowCount >= thresholds.rows) {
    return {
      kind: "large_export",
      severity: "warning",
      summary: `${who} exported ${event.rowCount} records from ${what}`,
      detail: `A single export of ${event.rowCount} records. Every freelancer in it had their details leave the application in one file.`
    };
  }
  return null;
}
__name(assessExport, "assessExport");
async function raiseAlert(env, draft, actor, now = /* @__PURE__ */ new Date()) {
  const since = new Date(now.getTime() - ALERT_THROTTLE_MINUTES * 6e4).toISOString();
  const recent = await first(
    env.DB,
    `SELECT id FROM alerts
     WHERE kind = ? AND COALESCE(user_id, '') = COALESCE(?, '') AND created_at > ?
     LIMIT 1`,
    draft.kind,
    actor.userId,
    since
  );
  if (recent) return null;
  const id = uid();
  await run(
    env.DB,
    `INSERT INTO alerts (id, kind, severity, summary, detail, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    draft.kind,
    draft.severity,
    draft.summary,
    draft.detail,
    actor.userId,
    actor.userName
  );
  log.warn("alert.raised", { kind: draft.kind, user: actor.userId, severity: draft.severity });
  return id;
}
__name(raiseAlert, "raiseAlert");
async function adminRecipients(db) {
  return all(
    db,
    `SELECT email, name FROM users WHERE role = 'admin' AND active = 1 AND email IS NOT NULL`
  );
}
__name(adminRecipients, "adminRecipients");
async function markAlertEmailed(db, id) {
  await run(db, `UPDATE alerts SET emailed = 1 WHERE id = ?`, id);
}
__name(markAlertEmailed, "markAlertEmailed");

// src/worker/modules/admin/exportAlert.ts
async function alertOnExport(env, input) {
  try {
    const row = await first(
      env.DB,
      `SELECT COUNT(*) AS n FROM access_log
       WHERE COALESCE(user_id, '') = COALESCE(?, '')
         AND action IN ('pool_export', 'contacts_export', 'access_log_export')
         AND created_at > datetime('now', '-1 day')`,
      input.userId
    );
    const draft = assessExport({ ...input, recentExports: row?.n ?? 1 });
    if (!draft) return;
    const id = await raiseAlert(env, draft, {
      userId: input.userId,
      userName: input.userName
    });
    if (!id) return;
    const admins = await adminRecipients(env.DB);
    if (!admins.length) return;
    const baseUrl = await resolveBaseUrl(env);
    const mail = alertEmail(
      { companyName: env.COMPANY_NAME, baseUrl },
      {
        summary: draft.summary,
        detail: draft.detail,
        severity: draft.severity,
        when: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC"
      }
    );
    let anySent = false;
    for (const admin of admins) {
      const ok = await sendEmail(env, {
        to: admin.email,
        subject: mail.subject,
        html: mail.html,
        template: "security_alert"
      });
      anySent = anySent || ok;
    }
    if (anySent) await markAlertEmailed(env.DB, id);
  } catch (e) {
    log.error("alert.export_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
__name(alertOnExport, "alertOnExport");

// src/worker/lib/cvStore.ts
var CHUNK_BYTES = 512 * 1024;
var MAX_CV_BYTES = 8 * 1024 * 1024;
var ALLOWED_CV_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};
function extensionOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}
__name(extensionOf, "extensionOf");
function isAcceptableCv(filename, mime) {
  if (ALLOWED_CV_TYPES[mime]) return true;
  return ["pdf", "doc", "docx"].includes(extensionOf(filename));
}
__name(isAcceptableCv, "isAcceptableCv");
function splitChunks(bytes, chunkSize = CHUNK_BYTES) {
  const out = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    out.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return out.length ? out : [new Uint8Array(0)];
}
__name(splitChunks, "splitChunks");
function joinChunks(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
__name(joinChunks, "joinChunks");
async function putCv(db, contactId, bytes) {
  if (bytes.length > MAX_CV_BYTES) {
    throw badRequest(
      `That file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB \u2014 please upload a smaller PDF.`,
      "cv_too_large"
    );
  }
  const chunks = splitChunks(bytes);
  const statements = [
    db.prepare(`DELETE FROM cv_chunks WHERE contact_id = ?`).bind(contactId),
    ...chunks.map(
      (chunk, idx) => db.prepare(`INSERT INTO cv_chunks (contact_id, idx, data) VALUES (?, ?, ?)`).bind(contactId, idx, chunk)
    )
  ];
  await db.batch(statements);
}
__name(putCv, "putCv");
async function getCv(db, contactId) {
  const rows = await all(
    db,
    `SELECT data FROM cv_chunks WHERE contact_id = ? ORDER BY idx ASC`,
    contactId
  );
  if (!rows.length) return null;
  return joinChunks(rows.map((r) => toBytes(r.data))).buffer;
}
__name(getCv, "getCv");
async function deleteCv(db, contactId) {
  await run(db, `DELETE FROM cv_chunks WHERE contact_id = ?`, contactId);
}
__name(deleteCv, "deleteCv");
function safeFilename(name, fallback = "cv") {
  const cleaned = (name ?? "").replace(/[^\p{L}\p{N}._ ()-]/gu, "_").trim().slice(0, 120);
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback;
}
__name(safeFilename, "safeFilename");
function cvResponse(bytes, filename, mime) {
  const type = mime && ALLOWED_CV_TYPES[mime] ? mime : "application/octet-stream";
  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store"
    }
  });
}
__name(cvResponse, "cvResponse");
function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  return new Uint8Array(value);
}
__name(toBytes, "toBytes");

// src/worker/lib/labels.ts
function parseLabels(raw2) {
  if (typeof raw2 !== "string" || raw2.length === 0) return [];
  try {
    const parsed = JSON.parse(raw2);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}
__name(parseLabels, "parseLabels");
function serialiseLabels(labels) {
  return JSON.stringify(labels.map((l) => l.trim()).filter((l) => l.length > 0));
}
__name(serialiseLabels, "serialiseLabels");

// src/worker/lib/inviteStatus.ts
function deriveInviteStatus(input) {
  if (input.hasProfile) {
    return { key: "registered", label: "Registered", tone: "good" };
  }
  if (input.suppressed || input.anonymized) {
    return { key: "declined", label: "Declined / do not contact", tone: "bad" };
  }
  if (input.replied) {
    const label = input.replyOutcome === "interested" ? "Replied \u2014 interested" : input.replyOutcome === "not_now" ? "Replied \u2014 not right now" : input.replyOutcome === "not_interested" ? "Replied \u2014 not interested" : "Replied";
    return {
      key: "replied",
      label,
      tone: input.replyOutcome === "interested" ? "good" : "neutral"
    };
  }
  if (input.emailUndeliverable && !input.hasLinkedin) {
    return { key: "undeliverable", label: "Email undeliverable", tone: "bad" };
  }
  if (input.outreachCount >= 2) {
    return { key: "invited_2", label: "Invited 2\xD7 \u2014 awaiting reply", tone: "warn" };
  }
  if (input.outreachCount === 1) {
    return { key: "invited_1", label: "Invited \u2014 awaiting reply", tone: "warn" };
  }
  if (input.linkedinState === "queued") {
    return { key: "queued_linkedin", label: "In the LinkedIn queue", tone: "neutral" };
  }
  if (!input.hasEmail && !input.hasLinkedin) {
    return { key: "no_channel", label: "No email or LinkedIn \u2014 unreachable", tone: "bad" };
  }
  return { key: "not_invited", label: "Not invited yet", tone: "neutral" };
}
__name(deriveInviteStatus, "deriveInviteStatus");

// src/worker/lib/linkedinKey.ts
function linkedinKey(raw2) {
  const input = (raw2 ?? "").trim();
  if (!input) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;
  const kind = segments[0].toLowerCase();
  if (kind === "in" && segments[1]) {
    return `in/${decodeSlug(segments[1])}`;
  }
  if (kind === "pub" && segments[1]) {
    return `pub/${decodeSlug(segments.slice(1).join("/"))}`;
  }
  if (kind === "sales" && (segments[1] === "lead" || segments[1] === "people") && segments[2]) {
    return `sales/${segments[2].split(",")[0].toLowerCase()}`;
  }
  return null;
}
__name(linkedinKey, "linkedinKey");
function decodeSlug(slug) {
  try {
    return decodeURIComponent(slug).toLowerCase().replace(/\/+$/, "");
  } catch {
    return slug.toLowerCase().replace(/\/+$/, "");
  }
}
__name(decodeSlug, "decodeSlug");

// src/worker/modules/contacts/routes.ts
var contactRoutes = new Hono2();
contactRoutes.use("*", requireAuth());
var STAGES = ["prospect", "contacted", "registered", "vetted", "on_mission", "closed"];
contactRoutes.get("/", async (c) => {
  const q = c.req.query();
  const where = [];
  const params = [];
  if (q.stage && STAGES.includes(q.stage)) {
    where.push("ct.stage = ?");
    params.push(q.stage);
  }
  if (q.suppressed === "1") where.push("ct.suppressed = 1");
  if (q.suppressed === "0") where.push("ct.suppressed = 0");
  if (q.channel === "linkedin") where.push("ct.linkedin_url IS NOT NULL AND ct.linkedin_url != ''");
  if (q.channel === "queued") where.push("ct.linkedin_state = 'queued'");
  if (q.contactable === "1") {
    where.push("ct.suppressed = 0 AND ct.anonymized_at IS NULL");
  }
  const search = (q.search ?? "").trim();
  if (search) {
    where.push("(ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const limit = Math.min(Number.parseInt(q.limit ?? "100", 10) || 100, 500);
  const offset = Math.max(Number.parseInt(q.offset ?? "0", 10) || 0, 0);
  const rows = await all(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.linkedin_key, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
            ct.source_note, ct.stage, ct.suppressed, ct.suppressed_reason, ct.outreach_count,
            ct.last_outreach_at, ct.linkedin_state, ct.anonymized_at, ct.created_at,
            ct.email_status, ct.replied_at, ct.reply_outcome,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ct.updated_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id)
  );
  const total = await first(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    ...params
  );
  return c.json({
    total: total?.n ?? rows.length,
    contacts: rows.map((r) => ({
      ...r,
      suppressed: r.suppressed === 1,
      has_profile: r.has_profile > 0,
      consents: consents.get(r.id),
      // Derived here, once, so every screen shows the same funnel position.
      invite_status: deriveInviteStatus({
        hasEmail: r.email !== null,
        hasLinkedin: r.linkedin_key !== null || Boolean(r.linkedin_url),
        hasProfile: r.has_profile > 0,
        suppressed: r.suppressed === 1,
        anonymized: r.anonymized_at !== null,
        outreachCount: r.outreach_count,
        linkedinState: r.linkedin_state,
        replied: r.replied_at !== null,
        replyOutcome: r.reply_outcome,
        emailUndeliverable: r.email_status === "bounced" || r.email_status === "complained"
      })
    }))
  });
});
contactRoutes.get("/stats", async (c) => {
  const row = await first(
    c.env.DB,
    `SELECT
       SUM(CASE WHEN stage = 'prospect' AND suppressed = 0 THEN 1 ELSE 0 END) AS prospects,
       SUM(CASE WHEN stage = 'contacted' AND suppressed = 0 THEN 1 ELSE 0 END) AS contacted,
       SUM(CASE WHEN stage IN ('registered','vetted','on_mission') THEN 1 ELSE 0 END) AS registered,
       SUM(CASE WHEN suppressed = 1 THEN 1 ELSE 0 END) AS suppressed,
       SUM(CASE WHEN linkedin_state = 'queued' THEN 1 ELSE 0 END) AS linkedin_queue
     FROM contacts`
  );
  return c.json({
    prospects: row?.prospects ?? 0,
    contacted: row?.contacted ?? 0,
    registered: row?.registered ?? 0,
    suppressed: row?.suppressed ?? 0,
    linkedinQueue: row?.linkedin_queue ?? 0
  });
});
var createSchema = external_exports.object({
  email: external_exports.string().email().optional(),
  first_name: external_exports.string().trim().max(80).default(""),
  last_name: external_exports.string().trim().max(80).default(""),
  phone: external_exports.string().trim().max(40).optional(),
  linkedin_url: external_exports.string().trim().max(300).optional(),
  source: external_exports.enum(["manual", "import", "linkedin", "referral", "event"]).default("manual"),
  source_note: external_exports.string().trim().max(300).optional()
});
contactRoutes.post("/", async (c) => {
  const input = createSchema.parse(await c.req.json());
  const email = input.email?.trim().toLowerCase();
  const liKey = linkedinKey(input.linkedin_url);
  if (!email && !liKey) {
    throw badRequest(
      "A contact needs an email address or a LinkedIn profile URL \u2014 otherwise nobody can ever reach them.",
      "no_channel"
    );
  }
  if (email) {
    const existing = await first(
      c.env.DB,
      `SELECT id FROM contacts WHERE email = ?`,
      email
    );
    if (existing) throw badRequest("That email address is already in the list.", "duplicate");
  }
  if (liKey) {
    const existing = await first(
      c.env.DB,
      `SELECT id FROM contacts WHERE linkedin_key = ?`,
      liKey
    );
    if (existing) throw badRequest("That LinkedIn profile is already in the list.", "duplicate");
  }
  const optedOut = email && await isSuppressed(c.env.DB, email) || liKey && (await filterSuppressedHashes(c.env.DB, [await linkedinHash(liKey)])).size > 0;
  if (optedOut) {
    throw badRequest(
      "This person has asked never to be contacted again. They can only come back by registering themselves.",
      "suppressed"
    );
  }
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    email ?? null,
    input.first_name,
    input.last_name,
    input.phone ?? null,
    input.linkedin_url ?? null,
    liKey,
    input.source,
    input.source_note ?? null
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "created",
    summary: `Added as a prospect (${input.source})`,
    actorUserId: c.get("user").id
  });
  return c.json({ ok: true, id });
});
contactRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const contact = await first(
    c.env.DB,
    `SELECT ct.*, (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ?`,
    id
  );
  if (!contact) throw notFound("No such contact");
  const [profile, consents, history, activity] = await Promise.all([
    first(c.env.DB, `SELECT * FROM profiles WHERE contact_id = ?`, id),
    currentConsents(c.env.DB, id),
    consentHistory(c.env.DB, id),
    all(
      c.env.DB,
      `SELECT kind, summary, detail, created_at FROM activity
       WHERE contact_id = ? ORDER BY created_at DESC LIMIT 200`,
      id
    )
  ]);
  return c.json({
    contact: {
      ...contact,
      suppressed: contact.suppressed === 1,
      has_profile: contact.has_profile > 0
    },
    profile: profile ? {
      ...profile,
      skills: parseLabels(profile.skills),
      industries: parseLabels(profile.industries),
      languages: parseLabels(profile.languages)
    } : null,
    consents,
    consentHistory: history,
    activity
  });
});
var patchSchema = external_exports.object({
  stage: external_exports.enum(["prospect", "contacted", "registered", "vetted", "on_mission", "closed"]).optional(),
  internal_notes: external_exports.string().max(4e3).nullable().optional(),
  owner_user_id: external_exports.string().nullable().optional(),
  first_name: external_exports.string().trim().max(80).optional(),
  last_name: external_exports.string().trim().max(80).optional(),
  linkedin_url: external_exports.string().trim().max(300).nullable().optional(),
  source_note: external_exports.string().trim().max(300).nullable().optional()
});
contactRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const input = patchSchema.parse(await c.req.json());
  const before = await first(
    c.env.DB,
    `SELECT stage FROM contacts WHERE id = ?`,
    id
  );
  if (!before) throw notFound("No such contact");
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === void 0) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (!fields.length) return c.json({ ok: true });
  await run(
    c.env.DB,
    `UPDATE contacts SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    ...params,
    id
  );
  if (input.stage && input.stage !== before.stage) {
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "stage_changed",
      summary: `Stage: ${before.stage} \u2192 ${input.stage}`,
      actorUserId: c.get("user").id
    });
  }
  return c.json({ ok: true });
});
contactRoutes.post("/:id/suppress", async (c) => {
  const id = c.req.param("id");
  const { reason, suppressed } = external_exports.object({
    reason: external_exports.string().trim().max(200).default("Asked not to be contacted"),
    suppressed: external_exports.boolean().default(true)
  }).parse(await c.req.json().catch(() => ({})));
  const target = await first(c.env.DB, `SELECT id FROM contacts WHERE id = ?`, id);
  if (!target) throw notFound("No such contact");
  if (suppressed) {
    await suppressContact(c.env, {
      contactId: id,
      reason,
      source: "admin",
      actorUserId: c.get("user").id
    });
  } else {
    await run(
      c.env.DB,
      `UPDATE contacts SET suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
         updated_at = datetime('now') WHERE id = ?`,
      id
    );
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "note",
      summary: "Suppression lifted by staff",
      actorUserId: c.get("user").id
    });
  }
  return c.json({ ok: true });
});
contactRoutes.post("/:id/note", async (c) => {
  const id = c.req.param("id");
  const { note } = external_exports.object({ note: external_exports.string().trim().min(1).max(2e3) }).parse(await c.req.json());
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "note",
    summary: note,
    actorUserId: c.get("user").id
  });
  return c.json({ ok: true });
});
contactRoutes.get("/:id/cv", async (c) => {
  const id = c.req.param("id");
  const meta = await first(
    c.env.DB,
    `SELECT cv_filename, cv_mime FROM profiles WHERE contact_id = ?`,
    id
  );
  const bytes = await getCv(c.env.DB, id);
  if (!bytes || !meta?.cv_filename) throw notFound("No CV on file for this freelancer");
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "cv_download",
    contactId: id,
    detail: meta.cv_filename,
    ip: clientIp(c.req.raw.headers)
  });
  return cvResponse(bytes, meta.cv_filename, meta.cv_mime);
});
contactRoutes.post("/import", async (c) => {
  const { csv, source, sourceNote } = external_exports.object({
    csv: external_exports.string().min(1).max(2e6),
    source: external_exports.enum(["import", "linkedin", "referral", "event"]).default("import"),
    sourceNote: external_exports.string().trim().max(200).optional()
  }).parse(await c.req.json());
  const parsed = mapImportRows(parseCsv(csv), linkedinKey);
  if (!parsed.rows.length) {
    return c.json({
      ok: false,
      imported: 0,
      duplicates: 0,
      suppressed: 0,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      unmappedHeaders: parsed.unmappedHeaders
    });
  }
  const emails = parsed.rows.flatMap((r) => r.email ? [r.email] : []);
  const liKeys = parsed.rows.flatMap((r) => r.linkedin_key ? [r.linkedin_key] : []);
  const existingEmails = new Set(
    (await selectByChunks(
      c.env.DB,
      (ph) => `SELECT email FROM contacts WHERE email IN (${ph})`,
      emails
    )).map((r) => r.email)
  );
  const existingKeys = new Set(
    (await selectByChunks(
      c.env.DB,
      (ph) => `SELECT linkedin_key FROM contacts WHERE linkedin_key IN (${ph})`,
      liKeys
    )).map((r) => r.linkedin_key)
  );
  const hashOf = /* @__PURE__ */ new Map();
  for (const row of parsed.rows) {
    if (row.email) hashOf.set(`e:${row.email}`, await emailHash(row.email));
    if (row.linkedin_key) hashOf.set(`l:${row.linkedin_key}`, await linkedinHash(row.linkedin_key));
  }
  const blockedHashes = await filterSuppressedHashes(c.env.DB, [...hashOf.values()]);
  const isBlocked = /* @__PURE__ */ __name((row) => row.email && blockedHashes.has(hashOf.get(`e:${row.email}`) ?? "") || row.linkedin_key && blockedHashes.has(hashOf.get(`l:${row.linkedin_key}`) ?? ""), "isBlocked");
  const isExisting = /* @__PURE__ */ __name((row) => row.email !== void 0 && existingEmails.has(row.email) || row.linkedin_key !== void 0 && existingKeys.has(row.linkedin_key), "isExisting");
  let suppressedCount = 0;
  let duplicates = 0;
  const actor = c.get("user").id;
  let imported = 0;
  for (const row of parsed.rows) {
    if (isExisting(row)) {
      duplicates++;
      continue;
    }
    if (isBlocked(row)) {
      suppressedCount++;
      continue;
    }
    const id = uid();
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, source_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      row.email ?? null,
      row.first_name,
      row.last_name,
      row.phone ?? null,
      row.linkedin_url ?? null,
      row.linkedin_key ?? null,
      source,
      sourceNote ?? row.source_note ?? null
    );
    imported++;
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "imported",
      summary: `Imported from a ${source} list \u2014 opted out by default${row.email ? "" : " (LinkedIn only, no email)"}`,
      actorUserId: actor
    });
  }
  return c.json({
    ok: true,
    imported,
    duplicates,
    suppressed: suppressedCount,
    skipped: parsed.skipped,
    warnings: parsed.warnings,
    unmappedHeaders: parsed.unmappedHeaders
  });
});
contactRoutes.get("/export/csv", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.linkedin_key, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
            ct.stage, ct.suppressed, ct.outreach_count, ct.last_outreach_at, ct.created_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.anonymized_at IS NULL ORDER BY ct.created_at DESC`
  );
  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id)
  );
  const csv = toCsv(
    [
      "Email",
      "First name",
      "Last name",
      "Phone",
      "LinkedIn",
      "Source",
      "Stage",
      "Do not contact",
      "Outreach touches",
      "Registered",
      "Consent: mission alerts",
      "Consent: news",
      "Added"
    ],
    rows.map((r) => {
      const cons = consents.get(r.id);
      return [
        r.email,
        r.first_name,
        r.last_name,
        r.phone ?? "",
        r.linkedin_url ?? "",
        r.source,
        r.stage,
        r.suppressed ? "yes" : "no",
        r.outreach_count,
        r.has_profile > 0 ? "yes" : "no",
        cons?.mission_alerts ? "yes" : "no",
        cons?.news ? "yes" : "no",
        r.created_at
      ];
    })
  );
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "contacts_export",
    detail: `${rows.length} contacts`,
    ip: clientIp(c.req.raw.headers)
  });
  await alertOnExport(c.env, {
    userId: user.id,
    userName: user.name,
    action: "contacts_export",
    rowCount: rows.length
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-contacts.csv"`
    }
  });
});
contactRoutes.post("/:id/reply", async (c) => {
  const id = c.req.param("id");
  const { outcome } = external_exports.object({ outcome: external_exports.enum(["interested", "not_now", "not_interested"]) }).parse(await c.req.json());
  const target = await first(c.env.DB, `SELECT id FROM contacts WHERE id = ?`, id);
  if (!target) throw notFound("No such contact");
  await run(
    c.env.DB,
    `UPDATE contacts
       SET replied_at = COALESCE(replied_at, datetime('now')), reply_outcome = ?,
           updated_at = datetime('now')
     WHERE id = ?`,
    outcome,
    id
  );
  const label = {
    interested: "Replied \u2014 interested",
    not_now: "Replied \u2014 not right now",
    not_interested: "Replied \u2014 not interested"
  }[outcome];
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "note",
    channel: "email",
    summary: `${label}. No further invitations will be sent.`,
    actorUserId: c.get("user").id
  });
  if (outcome === "not_interested") {
    await suppressContact(c.env, {
      contactId: id,
      reason: "Replied that they are not interested",
      source: "admin",
      actorUserId: c.get("user").id
    });
  }
  return c.json({ ok: true });
});

// src/worker/lib/apiToken.ts
var PREFIX = "nxext_";
async function createApiToken(db, userId, label) {
  const raw2 = `${PREFIX}${randomToken(32)}`;
  await run(
    db,
    `INSERT INTO api_tokens (token_hash, user_id, label) VALUES (?, ?, ?)`,
    await sha256Hex(raw2),
    userId,
    label.slice(0, 80)
  );
  return { id: await sha256Hex(raw2), raw: raw2 };
}
__name(createApiToken, "createApiToken");
async function verifyApiToken(db, authorization) {
  const raw2 = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw2.startsWith(PREFIX)) return null;
  const hash = await sha256Hex(raw2);
  const row = await first(
    db,
    `SELECT u.id, u.email, u.name, u.role, t.revoked_at
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND u.active = 1`,
    hash
  );
  if (!row || row.revoked_at) return null;
  await run(
    db,
    `UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`,
    hash
  ).catch(() => {
  });
  const { revoked_at: _drop, ...user } = row;
  return user;
}
__name(verifyApiToken, "verifyApiToken");
async function listApiTokens(db, userId) {
  return all(
    db,
    `SELECT token_hash, label, created_at, last_used_at, revoked_at
     FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
    userId
  );
}
__name(listApiTokens, "listApiTokens");
async function revokeApiToken(db, userId, tokenHash) {
  const res = await run(
    db,
    `UPDATE api_tokens SET revoked_at = datetime('now')
     WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
    tokenHash,
    userId
  );
  return res.meta.changes > 0;
}
__name(revokeApiToken, "revokeApiToken");

// src/worker/modules/outreach/linkedin.ts
var CONNECTION_NOTE_LIMIT = 300;
function connectionNote(input) {
  const name = input.firstName.trim();
  const hello = name ? `Hi ${name}` : "Hello";
  const note = `${hello} \u2014 I'm ${input.senderName} at ${input.companyName}. We place experienced freelancers on client missions and are building our pool. Happy to connect.`;
  return note.length <= CONNECTION_NOTE_LIMIT ? note : `${note.slice(0, CONNECTION_NOTE_LIMIT - 1)}\u2026`;
}
__name(connectionNote, "connectionNote");
function directMessage(input) {
  const name = input.firstName.trim();
  const hello = name ? `Hi ${name},` : "Hello,";
  const focus = input.focus?.trim() ? ` Your background in ${input.focus.trim()} is the kind of profile our clients ask for.` : "";
  return `${hello}

I'm ${input.senderName} from ${input.companyName}. We're a consulting firm and we regularly place experienced freelancers on client missions.${focus}

We're building a pool of freelancers we can call when something fits. If that's of interest, you can add yourself in about three minutes \u2014 experience, skills, day rate, availability and CV:

${input.registerUrl}

No account or password needed, and you can update or remove your details whenever you like. If it's not for you, no problem at all.

Best regards,
${input.senderName}`;
}
__name(directMessage, "directMessage");

// src/worker/modules/ext/routes.ts
var extRoutes = new Hono2();
extRoutes.options(
  "/*",
  (c) => c.body(null, 204, {
    "Access-Control-Allow-Origin": c.req.header("origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
  })
);
extRoutes.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const user = await verifyApiToken(c.env.DB, c.req.header("authorization"));
  if (!user) throw unauthorized("Invalid or revoked API token");
  c.set("user", user);
  await next();
  c.header("Access-Control-Allow-Origin", c.req.header("origin") ?? "*");
});
extRoutes.get("/whoami", (c) => {
  const user = c.get("user");
  return c.json({ ok: true, name: user.name, email: user.email });
});
extRoutes.get("/lookup", async (c) => {
  const url = c.req.query("url") ?? "";
  const key = linkedinKey(url);
  if (!key) return c.json({ found: false, reason: "not_a_profile" });
  const row = await first(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            ct.replied_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.linkedin_key = ? AND ct.anonymized_at IS NULL`,
    key
  );
  if (!row) return c.json({ found: false, reason: "not_in_pool" });
  const user = c.get("user");
  const name = `${row.first_name} ${row.last_name}`.trim();
  if (row.has_profile > 0) {
    return c.json({
      found: true,
      alreadyRegistered: true,
      contact: { id: row.id, name }
    });
  }
  if (row.suppressed) {
    return c.json({
      found: true,
      blocked: true,
      reason: "This person asked not to be contacted.",
      contact: { id: row.id, name }
    });
  }
  const decision = decideOutreach(
    {
      suppressed: false,
      anonymized: false,
      hasProfile: false,
      outreachCount: row.outreach_count,
      lastOutreachAt: row.last_outreach_at,
      replied: row.replied_at !== null
    },
    policyOf(c.env)
  );
  const baseUrl = await resolveBaseUrl(c.env);
  const inviteToken = await createActionToken(c.env.DB, {
    purpose: "join_prefill",
    contactId: row.id,
    payload: { channel: "linkedin" }
  });
  const input = {
    firstName: row.first_name,
    companyName: c.env.COMPANY_NAME,
    senderName: user.name,
    registerUrl: `${baseUrl}/join?invite=${inviteToken}`,
    focus: c.req.query("focus") ?? void 0
  };
  return c.json({
    found: true,
    contact: { id: row.id, name, linkedin_url: row.linkedin_url },
    decision,
    connectionNote: connectionNote(input),
    message: directMessage(input)
  });
});
extRoutes.post("/sent", async (c) => {
  const { contactId } = external_exports.object({ contactId: external_exports.string().min(1) }).parse(await c.req.json());
  const user = c.get("user");
  const row = await first(
    c.env.DB,
    `SELECT ct.id, ct.suppressed, ct.outreach_count, ct.last_outreach_at, ct.replied_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ? AND ct.anonymized_at IS NULL`,
    contactId
  );
  if (!row) return c.json({ ok: false, error: "not_found" }, 404);
  const decision = decideOutreach(
    {
      suppressed: row.suppressed === 1,
      anonymized: false,
      hasProfile: row.has_profile > 0,
      outreachCount: row.outreach_count,
      lastOutreachAt: row.last_outreach_at,
      replied: row.replied_at !== null
    },
    policyOf(c.env)
  );
  if (!decision.allowed) {
    return c.json({ ok: false, error: "not_allowed", reason: decision.reason }, 409);
  }
  await run(
    c.env.DB,
    `UPDATE contacts
       SET linkedin_state = 'sent', linkedin_sent_at = datetime('now'),
           outreach_count = outreach_count + 1,
           first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
           last_outreach_at = datetime('now'),
           stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
           updated_at = datetime('now')
     WHERE id = ?`,
    contactId
  );
  await logActivity(c.env.DB, {
    contactId,
    kind: "linkedin_sent",
    channel: "linkedin",
    summary: "LinkedIn message sent by hand (browser extension)",
    actorUserId: user.id
  });
  return c.json({ ok: true });
});

// src/worker/modules/ext/tokens.ts
var extTokenRoutes = new Hono2();
extTokenRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tokens = await listApiTokens(c.env.DB, user.id);
  return c.json({
    tokens: tokens.map((t) => ({
      // The hash is safe to expose — it is not the token, and revoking needs it.
      id: t.token_hash,
      label: t.label,
      created_at: t.created_at,
      last_used_at: t.last_used_at,
      revoked: t.revoked_at !== null
    }))
  });
});
extTokenRoutes.post("/", async (c) => {
  const { label } = external_exports.object({ label: external_exports.string().trim().max(80).default("Browser extension") }).parse(await c.req.json().catch(() => ({})));
  const user = c.get("user");
  const { id, raw: raw2 } = await createApiToken(c.env.DB, user.id, label || "Browser extension");
  return c.json({ ok: true, id, token: raw2 });
});
extTokenRoutes.post("/:id/revoke", async (c) => {
  const user = c.get("user");
  const ok = await revokeApiToken(c.env.DB, user.id, c.req.param("id"));
  if (!ok) throw notFound("No such active token");
  return c.json({ ok: true });
});

// src/worker/lib/replyMatch.ts
function senderAddress(from) {
  const raw2 = (from ?? "").trim();
  if (!raw2) return null;
  const angled = /<([^>]+)>/.exec(raw2);
  const candidate = (angled ? angled[1] : raw2).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}
__name(senderAddress, "senderAddress");
function isAutomatedReply(headers, subject) {
  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  const precedence = (headers.get("precedence") ?? "").toLowerCase();
  if (["bulk", "auto_reply", "list", "junk"].includes(precedence)) return true;
  for (const name of ["x-autoreply", "x-autorespond", "x-auto-response-suppress"]) {
    if (headers.get(name)) return true;
  }
  if ((headers.get("x-mailer") ?? "").toLowerCase().includes("autoreply")) return true;
  const s = (subject ?? "").toLowerCase();
  return /^(automatic reply|auto[- ]?reply|out of (the )?office|afwezig|automatisch antwoord|absence|réponse automatique|abwesenheit)/.test(
    s.trim()
  );
}
__name(isAutomatedReply, "isAutomatedReply");
function classifyIncoming(from, headers, subject) {
  const address = senderAddress(from);
  if (isAutomatedReply(headers, subject)) return { kind: "automated", address };
  if (!address) return { kind: "unusable" };
  return { kind: "human", address };
}
__name(classifyIncoming, "classifyIncoming");

// src/worker/modules/inbound/email.ts
async function handleInboundEmail(message, env) {
  const subject = message.headers.get("subject");
  const decision = classifyIncoming(message.from, message.headers, subject);
  if (decision.kind === "unusable") {
    log.info("inbound.unusable", { to: message.to });
    return;
  }
  const address = decision.address;
  const contact = address ? await first(
    env.DB,
    `SELECT id, replied_at FROM contacts WHERE email = ? AND anonymized_at IS NULL`,
    address
  ) : null;
  if (!contact) {
    log.info("inbound.unmatched", { automated: decision.kind === "automated" });
    return;
  }
  if (decision.kind === "automated") {
    await logActivity(env.DB, {
      contactId: contact.id,
      kind: "note",
      channel: "email",
      summary: `Automatic reply received${subject ? ` (${subject.slice(0, 80)})` : ""} \u2014 the sequence continues`
    });
    return;
  }
  if (contact.replied_at) return;
  await run(
    env.DB,
    `UPDATE contacts SET replied_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    contact.id
  );
  await logActivity(env.DB, {
    contactId: contact.id,
    kind: "note",
    channel: "email",
    summary: "Replied to our email \u2014 no further invitations will be sent",
    detail: subject ? subject.slice(0, 200) : null
  });
  log.info("inbound.reply", { contact: contact.id });
}
__name(handleInboundEmail, "handleInboundEmail");

// src/worker/modules/outreach/routes.ts
var outreachRoutes = new Hono2();
outreachRoutes.use("*", requireAuth());
outreachRoutes.post("/send", async (c) => {
  const { contactIds } = external_exports.object({ contactIds: external_exports.array(external_exports.string().min(1)).min(1).max(200) }).parse(await c.req.json());
  const rows = await selectByChunks(
    c.env.DB,
    (ph) => `${CANDIDATE_SELECT} WHERE ct.id IN (${ph})`,
    contactIds
  );
  const user = c.get("user");
  const results = [];
  for (const row of rows) {
    results.push(await sendOutreachTo(c.env, row, user.name, user.id));
  }
  return c.json({
    ok: true,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent),
    results
  });
});
outreachRoutes.get("/eligible", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const rows = await all(
    c.env.DB,
    `${CANDIDATE_SELECT}
     WHERE ct.suppressed = 0 AND ct.anonymized_at IS NULL
     ORDER BY ct.outreach_count ASC, ct.created_at ASC
     LIMIT ?`,
    limit * 3
  );
  const policy = policyOf(c.env);
  const now = /* @__PURE__ */ new Date();
  const evaluated = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    outreach_count: row.outreach_count,
    decision: decideOutreach(toCandidate(row), policy, now)
  }));
  return c.json({
    policy,
    due: evaluated.filter((e) => e.decision.allowed).slice(0, limit),
    blocked: evaluated.filter((e) => !e.decision.allowed).slice(0, limit)
  });
});
outreachRoutes.get("/linkedin/:id", async (c) => {
  const id = c.req.param("id");
  const row = await first(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ?`,
    id
  );
  if (!row) throw notFound("No such contact");
  const baseUrl = await resolveBaseUrl(c.env);
  const user = c.get("user");
  const inviteToken = await createActionToken(c.env.DB, {
    purpose: "join_prefill",
    contactId: row.id,
    payload: { channel: "linkedin" }
  });
  const input = {
    firstName: row.first_name,
    companyName: c.env.COMPANY_NAME,
    senderName: user.name,
    registerUrl: `${baseUrl}/join?invite=${inviteToken}`,
    focus: c.req.query("focus") ?? void 0
  };
  const decision = decideOutreach(toCandidate(row), policyOf(c.env));
  return c.json({
    contact: {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      linkedin_url: row.linkedin_url
    },
    decision,
    connectionNote: connectionNote(input),
    message: directMessage(input)
  });
});
outreachRoutes.post("/linkedin/:id/queue", async (c) => {
  const id = c.req.param("id");
  await run(
    c.env.DB,
    `UPDATE contacts SET linkedin_state = 'queued', updated_at = datetime('now') WHERE id = ?`,
    id
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "linkedin_queued",
    channel: "linkedin",
    summary: "Queued for a LinkedIn message",
    actorUserId: c.get("user").id
  });
  return c.json({ ok: true });
});
outreachRoutes.post("/linkedin/:id/sent", async (c) => {
  const id = c.req.param("id");
  await run(
    c.env.DB,
    `UPDATE contacts
       SET linkedin_state = 'sent', linkedin_sent_at = datetime('now'),
           outreach_count = outreach_count + 1,
           first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
           last_outreach_at = datetime('now'),
           stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
           updated_at = datetime('now')
     WHERE id = ?`,
    id
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "linkedin_sent",
    channel: "linkedin",
    summary: "LinkedIn message sent by hand",
    actorUserId: c.get("user").id
  });
  return c.json({ ok: true });
});
outreachRoutes.get("/wave", async (c) => {
  const state = await readWave(c.env.DB);
  const remaining = await countWaveRemaining(c.env.DB);
  const channelPriority = await readChannelPriority(c.env.DB);
  const sent = state.startedAt ? (await first(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM email_log
         WHERE template = 'invite' AND status = 'sent' AND created_at >= ?`,
    state.startedAt
  ))?.n ?? 0 : 0;
  return c.json({
    ...state,
    remaining,
    channelPriority,
    sentSinceStart: sent,
    nextRunUtc: "07:00"
  });
});
outreachRoutes.post("/channel", async (c) => {
  const { priority } = external_exports.object({ priority: external_exports.enum(["email", "linkedin"]) }).parse(await c.req.json());
  await writeChannelPriority(c.env.DB, priority);
  return c.json({ ok: true, channelPriority: priority });
});
outreachRoutes.post("/wave", async (c) => {
  const { action, dailyLimit } = external_exports.object({
    action: external_exports.enum(["start", "pause"]),
    dailyLimit: external_exports.number().int().min(1).max(100).optional()
  }).parse(await c.req.json());
  const state = await readWave(c.env.DB);
  if (action === "start") {
    await writeWave(c.env.DB, {
      active: true,
      dailyLimit: clampLimit(dailyLimit ?? state.dailyLimit),
      // A restart after a pause keeps the original start, so the progress
      // number keeps counting the whole wave rather than resetting.
      startedAt: state.startedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      completedAt: null
    });
  } else {
    await writeWave(c.env.DB, { ...state, active: false });
  }
  return c.json({ ok: true, state: await readWave(c.env.DB) });
});
outreachRoutes.get("/queue", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const preferred = await readChannelPriority(c.env.DB);
  const rows = await all(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            ct.linkedin_state,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ct.linkedin_url IS NOT NULL
       AND ct.linkedin_state != 'sent'
       AND ct.outreach_count < ?
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
       ${linkedinChannelSql(preferred)}
     ORDER BY CASE ct.linkedin_state WHEN 'queued' THEN 0 ELSE 1 END,
              ct.email IS NOT NULL, ct.created_at ASC
     LIMIT ?`,
    policyOf(c.env).maxTouches,
    limit
  );
  return c.json({
    queue: rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      linkedin_url: r.linkedin_url,
      hasEmail: r.email !== null,
      queued: r.linkedin_state === "queued",
      outreach_count: r.outreach_count
    }))
  });
});

// src/worker/lib/profileFields.ts
var LANGUAGE_LEVELS = ["native", "fluent", "good", "basic"];
var GRADED_LANGUAGES = [
  { key: "French", label: "French" },
  { key: "Dutch", label: "Dutch" },
  { key: "English", label: "English" }
];
function isLanguageLevel(value) {
  return typeof value === "string" && LANGUAGE_LEVELS.includes(value);
}
__name(isLanguageLevel, "isLanguageLevel");
function cleanLanguageLevels(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  const known = new Set(GRADED_LANGUAGES.map((g) => g.key));
  for (const [lang, level] of Object.entries(input)) {
    if (known.has(lang) && isLanguageLevel(level)) out[lang] = level;
  }
  return out;
}
__name(cleanLanguageLevels, "cleanLanguageLevels");
function languagesFromLevels(levels, extras = []) {
  const out = new Set(Object.keys(levels));
  for (const extra of extras) {
    const trimmed = extra.trim();
    if (trimmed) out.add(trimmed);
  }
  return [...out];
}
__name(languagesFromLevels, "languagesFromLevels");
var BELGIAN_REGIONS = [
  { code: "brussels", label: "Brussels-Capital", group: "Brussels" },
  { code: "antwerp", label: "Antwerp", group: "Flanders" },
  { code: "east_flanders", label: "East Flanders", group: "Flanders" },
  { code: "west_flanders", label: "West Flanders", group: "Flanders" },
  { code: "flemish_brabant", label: "Flemish Brabant", group: "Flanders" },
  { code: "limburg", label: "Limburg", group: "Flanders" },
  { code: "walloon_brabant", label: "Walloon Brabant", group: "Wallonia" },
  { code: "hainaut", label: "Hainaut", group: "Wallonia" },
  { code: "liege", label: "Li\xE8ge", group: "Wallonia" },
  { code: "luxembourg", label: "Luxembourg", group: "Wallonia" },
  { code: "namur", label: "Namur", group: "Wallonia" },
  { code: "remote", label: "Fully remote", group: "Remote" }
];
function mobilityHasRemote(mobility) {
  return mobility.includes("remote");
}
__name(mobilityHasRemote, "mobilityHasRemote");
var REGION_CODES = new Set(BELGIAN_REGIONS.map((r) => r.code));
function cleanMobility(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const code of input) {
    if (typeof code === "string" && REGION_CODES.has(code) && !out.includes(code)) {
      out.push(code);
    }
  }
  return out;
}
__name(cleanMobility, "cleanMobility");
function regionLabel(code) {
  return BELGIAN_REGIONS.find((r) => r.code === code)?.label ?? code;
}
__name(regionLabel, "regionLabel");
var WORK_REGIMES = [
  { code: "full_time", label: "Full-time" },
  { code: "part_time", label: "Part-time" }
];
var REGIME_CODES = new Set(WORK_REGIMES.map((r) => r.code));
function cleanWorkRegime(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const code of input) {
    if (typeof code === "string" && REGIME_CODES.has(code) && !out.includes(code)) {
      out.push(code);
    }
  }
  return out;
}
__name(cleanWorkRegime, "cleanWorkRegime");
function regimeLabel(code) {
  return WORK_REGIMES.find((r) => r.code === code)?.label ?? code;
}
__name(regimeLabel, "regimeLabel");
var NOTICE_PERIODS = [
  { code: "immediate", label: "Immediately" },
  { code: "1_week", label: "Within 1 week" },
  { code: "2_weeks", label: "Within 2 weeks" },
  { code: "1_month", label: "1 month" },
  { code: "2_months", label: "2 months" },
  { code: "3_months_plus", label: "3 months or more" }
];
var NOTICE_CODES = new Set(NOTICE_PERIODS.map((n) => n.code));
function cleanNoticePeriod(input) {
  return typeof input === "string" && NOTICE_CODES.has(input) ? input : null;
}
__name(cleanNoticePeriod, "cleanNoticePeriod");
function noticeLabel(code) {
  if (!code) return "";
  return NOTICE_PERIODS.find((n) => n.code === code)?.label ?? code;
}
__name(noticeLabel, "noticeLabel");

// src/worker/modules/pool/routes.ts
var poolRoutes = new Hono2();
poolRoutes.use("*", requireAuth());
function segmentFromQuery(q) {
  const list = /* @__PURE__ */ __name((value) => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean), "list");
  const num = /* @__PURE__ */ __name((value) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) ? n : void 0;
  }, "num");
  return {
    skills: list(q.skills),
    industries: list(q.industries),
    languages: list(q.languages),
    mobility: list(q.mobility),
    workRegime: list(q.workRegime),
    availability: list(q.availability),
    availableWithinDays: num(q.availableWithinDays),
    rateMin: num(q.rateMin),
    rateMax: num(q.rateMax),
    minYears: num(q.minYears),
    stages: list(q.stages),
    staleDays: num(q.staleDays),
    search: q.search
  };
}
__name(segmentFromQuery, "segmentFromQuery");
var POOL_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.stage,
         p.headline, p.years_experience, p.years_relevant, p.skills, p.industries, p.languages,
         p.language_levels, p.mobility, p.work_regime, p.notice_period, p.certifications,
         p.daily_rate, p.currency, p.availability, p.available_from, p.location,
         p.remote_ok, p.cv_filename, p.updated_at, p.last_confirmed_at, p.verified_at
  FROM contacts ct
  JOIN profiles p ON p.contact_id = ct.id`;
poolRoutes.get("/", async (c) => {
  const segment = segmentFromQuery(c.req.query());
  const frag = buildPoolFilter(segment);
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "200", 10) || 200, 500);
  const rows = await all(
    c.env.DB,
    `${POOL_SELECT} ${whereClause(frag)} ORDER BY p.updated_at DESC LIMIT ?`,
    ...frag.params,
    limit
  );
  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id)
  );
  const total = await first(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct JOIN profiles p ON p.contact_id = ct.id ${whereClause(frag)}`,
    ...frag.params
  );
  return c.json({
    total: total?.n ?? rows.length,
    freelancers: rows.map((r) => ({
      ...r,
      skills: parseLabels(r.skills),
      industries: parseLabels(r.industries),
      languages: parseLabels(r.languages),
      language_levels: safeParse(r.language_levels),
      mobility: safeParse(r.mobility),
      work_regime: safeParse(r.work_regime),
      notice_period: r.notice_period,
      certifications: parseLabels(r.certifications),
      remote_ok: r.remote_ok === 1,
      verified: r.verified_at !== null,
      consents: consents.get(r.id)
    }))
  });
});
poolRoutes.get("/stats", async (c) => {
  const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const stale = new Date(Date.now() - 180 * 864e5).toISOString();
  const row = await first(
    c.env.DB,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN p.availability = 'now' THEN 1 ELSE 0 END) AS available_now,
       SUM(CASE WHEN p.availability = 'from_date' AND p.available_from IS NOT NULL
                 AND p.available_from <= ? THEN 1 ELSE 0 END) AS available_soon,
       SUM(CASE WHEN COALESCE(p.last_confirmed_at, p.updated_at) < ? THEN 1 ELSE 0 END) AS stale
     FROM contacts ct JOIN profiles p ON p.contact_id = ct.id
     WHERE ct.suppressed = 0 AND ct.anonymized_at IS NULL`,
    soon,
    stale
  );
  return c.json({
    total: row?.total ?? 0,
    availableNow: row?.available_now ?? 0,
    availableSoon: row?.available_soon ?? 0,
    stale: row?.stale ?? 0
  });
});
poolRoutes.get("/export/csv", async (c) => {
  const frag = buildPoolFilter(segmentFromQuery(c.req.query()));
  const rows = await all(
    c.env.DB,
    `${POOL_SELECT} ${whereClause(frag)} ORDER BY ct.last_name, ct.first_name`,
    ...frag.params
  );
  const csv = toCsv(
    [
      "First name",
      "Last name",
      "Email",
      "Headline",
      "Years total",
      "Years relevant",
      "Languages (graded)",
      "Mobility",
      "Work regime",
      "Notice period",
      "Certifications",
      "Skills",
      "Industries",
      "Languages",
      "Day rate",
      "Availability",
      "Available from",
      "Location",
      "Remote",
      "CV on file",
      "Stage",
      "Last updated"
    ],
    rows.map((r) => [
      r.first_name,
      r.last_name,
      r.email,
      r.headline,
      r.years_experience ?? "",
      r.years_relevant ?? "",
      gradedLanguages(r.language_levels),
      mobilityLabels(r.mobility),
      cleanWorkRegime(safeParse(r.work_regime)).map(regimeLabel).join("; "),
      noticeLabel(r.notice_period),
      parseLabels(r.certifications).join("; "),
      parseLabels(r.skills).join("; "),
      parseLabels(r.industries).join("; "),
      parseLabels(r.languages).join("; "),
      r.daily_rate ?? "",
      r.availability,
      r.available_from ?? "",
      r.location ?? "",
      r.remote_ok ? "yes" : "no",
      r.cv_filename ? "yes" : "no",
      r.stage,
      r.updated_at
    ])
  );
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "pool_export",
    detail: `${rows.length} freelancers`,
    ip: clientIp(c.req.raw.headers)
  });
  await alertOnExport(c.env, {
    userId: user.id,
    userName: user.name,
    action: "pool_export",
    rowCount: rows.length
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-talent-pool.csv"`
    }
  });
});
function safeParse(raw2) {
  try {
    return JSON.parse(raw2);
  } catch {
    return null;
  }
}
__name(safeParse, "safeParse");
function gradedLanguages(raw2) {
  const levels = cleanLanguageLevels(safeParse(raw2));
  return Object.entries(levels).map(([lang, level]) => `${lang}: ${level}`).join("; ");
}
__name(gradedLanguages, "gradedLanguages");
function mobilityLabels(raw2) {
  return cleanMobility(safeParse(raw2)).map(regionLabel).join("; ");
}
__name(mobilityLabels, "mobilityLabels");

// src/worker/lib/webhookSignature.ts
var REPLAY_TOLERANCE_SECONDS = 300;
function decodeSecret(secret) {
  const raw2 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const binary = atob(raw2);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}
__name(decodeSecret, "decodeSecret");
function signedPayload(id, timestamp, body) {
  return `${id}.${timestamp}.${body}`;
}
__name(signedPayload, "signedPayload");
async function computeSignature(secretBytes, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
__name(computeSignature, "computeSignature");
async function verifyWebhook(headers, body, secret, nowSeconds = Math.floor(Date.now() / 1e3)) {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing_headers" };
  }
  const sentAt = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(nowSeconds - sentAt) > REPLAY_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const secretBytes = decodeSecret(secret);
  if (!secretBytes) return { ok: false, reason: "bad_secret" };
  const expected = await computeSignature(
    secretBytes,
    signedPayload(headers.id, headers.timestamp, body)
  );
  let matched = false;
  for (const entry of headers.signature.split(" ")) {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) continue;
    if (timingSafeEqual(value, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: "no_match" };
}
__name(verifyWebhook, "verifyWebhook");

// src/worker/modules/notifications/webhook.ts
var webhookRoutes = new Hono2();
webhookRoutes.post("/resend", async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    log.warn("webhook.no_secret");
    return c.json({ error: "not_configured" }, 503);
  }
  const body = await c.req.text();
  const verdict = await verifyWebhook(
    {
      id: c.req.header("svix-id"),
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature")
    },
    body,
    secret
  );
  if (!verdict.ok) {
    log.warn("webhook.rejected", { reason: verdict.reason });
    return c.json({ error: "invalid_signature" }, 401);
  }
  const eventId = c.req.header("svix-id");
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ ok: true, ignored: "unparseable" });
  }
  const seen = await first(
    c.env.DB,
    `SELECT id FROM webhook_events WHERE id = ?`,
    eventId
  );
  if (seen) return c.json({ ok: true, duplicate: true });
  await run(
    c.env.DB,
    `INSERT INTO webhook_events (id, provider, kind) VALUES (?, 'resend', ?)`,
    eventId,
    event.type ?? "unknown"
  );
  const result = classifyDeliveryEvent(
    event.type ?? "",
    event.data?.bounce?.type,
    event.data?.bounce?.message ?? event.data?.reason
  );
  const providerId = event.data?.email_id ?? null;
  if (providerId) {
    await run(
      c.env.DB,
      `UPDATE email_log
         SET delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
             bounced_at   = CASE WHEN ? IS NOT NULL AND ? != 'delivered' THEN datetime('now') ELSE bounced_at END,
             bounce_kind  = COALESCE(?, bounce_kind),
             outcome_detail = COALESCE(?, outcome_detail)
       WHERE provider_id = ?`,
      result.contactStatus,
      result.bounceKind,
      result.contactStatus,
      result.bounceKind,
      event.data?.bounce?.message ?? event.data?.reason ?? null,
      providerId
    );
  }
  const recipient = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  const contact = providerId ? await first(
    c.env.DB,
    `SELECT contact_id FROM email_log WHERE provider_id = ?`,
    providerId
  ) : null;
  let contactId = contact?.contact_id ?? null;
  if (!contactId && recipient) {
    const byEmail = await first(
      c.env.DB,
      `SELECT id FROM contacts WHERE email = ?`,
      recipient.toLowerCase()
    );
    contactId = byEmail?.id ?? null;
  }
  if (!contactId) {
    log.info("webhook.unmatched", { type: event.type, providerId });
    return c.json({ ok: true, matched: false });
  }
  if (result.contactStatus) {
    await run(
      c.env.DB,
      `UPDATE contacts
         SET email_status = ?,
             email_failed_at = CASE WHEN ? THEN datetime('now') ELSE email_failed_at END,
             updated_at = datetime('now')
       WHERE id = ?`,
      result.contactStatus,
      result.stopEmailing ? 1 : 0,
      contactId
    );
  }
  if (result.activity) {
    await logActivity(c.env.DB, {
      contactId,
      kind: result.suppress ? "suppressed" : "email_failed",
      channel: "email",
      summary: result.activity
    });
  }
  if (result.suppress) {
    await suppressContact(c.env, {
      contactId,
      reason: "Marked our email as spam",
      source: "unsubscribe_link"
    });
  }
  log.info("webhook.handled", { type: event.type, contact: contactId });
  return c.json({ ok: true });
});

// src/worker/modules/portal/routes.ts
function safeJson(raw2) {
  try {
    return JSON.parse(raw2);
  } catch {
    return null;
  }
}
__name(safeJson, "safeJson");
var portalRoutes = new Hono2();
portalRoutes.use("*", requirePortal());
async function loadProfile(db, contactId) {
  const row = await first(
    db,
    `SELECT headline, years_experience, years_relevant, skills, industries, languages,
            language_levels, mobility, work_regime, notice_period, certifications, daily_rate, currency,
            availability, available_from, location, remote_ok, freelancer_note,
            cv_filename, cv_size, cv_uploaded_at, registered_at, updated_at, last_confirmed_at
     FROM profiles WHERE contact_id = ?`,
    contactId
  );
  if (!row) throw notFound("We could not find your profile");
  return {
    ...row,
    skills: parseLabels(row.skills),
    industries: parseLabels(row.industries),
    languages: parseLabels(row.languages),
    language_levels: cleanLanguageLevels(safeJson(row.language_levels)),
    mobility: cleanMobility(safeJson(row.mobility)),
    work_regime: cleanWorkRegime(safeJson(row.work_regime)),
    notice_period: row.notice_period,
    certifications: parseLabels(row.certifications),
    remote_ok: row.remote_ok === 1
  };
}
__name(loadProfile, "loadProfile");
portalRoutes.get("/me", async (c) => {
  const contact = c.get("contact");
  const profile = await loadProfile(c.env.DB, contact.id);
  const consents = await currentConsents(c.env.DB, contact.id);
  return c.json({ contact, profile, consents });
});
var profileSchema = external_exports.object({
  first_name: external_exports.string().trim().min(1).max(80).optional(),
  last_name: external_exports.string().trim().min(1).max(80).optional(),
  phone: external_exports.string().trim().max(40).nullable().optional(),
  linkedin_url: external_exports.string().trim().max(300).nullable().optional(),
  headline: external_exports.string().trim().max(200).optional(),
  years_experience: external_exports.number().int().min(0).max(70).nullable().optional(),
  years_relevant: external_exports.number().int().min(0).max(70).nullable().optional(),
  skills: external_exports.array(external_exports.string().trim().min(1).max(80)).max(30).optional(),
  industries: external_exports.array(external_exports.string().trim().min(1).max(80)).max(30).optional(),
  languages: external_exports.array(external_exports.string().trim().min(1).max(40)).max(15).optional(),
  language_levels: external_exports.record(external_exports.string(), external_exports.string()).optional(),
  mobility: external_exports.array(external_exports.string()).max(10).optional(),
  work_regime: external_exports.array(external_exports.string()).max(4).optional(),
  notice_period: external_exports.string().max(30).nullable().optional(),
  certifications: external_exports.array(external_exports.string().trim().min(1).max(120)).max(40).optional(),
  daily_rate: external_exports.number().int().min(0).max(1e4).nullable().optional(),
  availability: external_exports.enum(["now", "from_date", "not_available"]).optional(),
  available_from: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  location: external_exports.string().trim().max(120).nullable().optional(),
  remote_ok: external_exports.boolean().optional(),
  freelancer_note: external_exports.string().trim().max(2e3).nullable().optional()
});
portalRoutes.patch("/profile", async (c) => {
  const contact = c.get("contact");
  const input = profileSchema.parse(await c.req.json());
  if (input.availability === "from_date" && input.available_from === null) {
    throw badRequest("Please give the date you become available.");
  }
  const nameUpdates = [];
  const nameParams = [];
  if (input.first_name !== void 0) {
    nameUpdates.push("first_name = ?");
    nameParams.push(input.first_name);
  }
  if (input.last_name !== void 0) {
    nameUpdates.push("last_name = ?");
    nameParams.push(input.last_name);
  }
  if (input.phone !== void 0) {
    nameUpdates.push("phone = ?");
    nameParams.push(input.phone);
  }
  if (input.linkedin_url !== void 0) {
    nameUpdates.push("linkedin_url = ?");
    nameParams.push(input.linkedin_url);
  }
  if (nameUpdates.length) {
    await run(
      c.env.DB,
      `UPDATE contacts SET ${nameUpdates.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...nameParams,
      contact.id
    );
  }
  const fields = [];
  const params = [];
  const set = /* @__PURE__ */ __name((column, value) => {
    fields.push(`${column} = ?`);
    params.push(value);
  }, "set");
  if (input.headline !== void 0) set("headline", input.headline);
  if (input.years_experience !== void 0) set("years_experience", input.years_experience);
  if (input.years_relevant !== void 0) set("years_relevant", input.years_relevant);
  if (input.skills !== void 0) set("skills", serialiseLabels(input.skills));
  if (input.industries !== void 0) set("industries", serialiseLabels(input.industries));
  if (input.language_levels !== void 0) {
    const levels = cleanLanguageLevels(input.language_levels);
    set("language_levels", JSON.stringify(levels));
    set("languages", serialiseLabels(languagesFromLevels(levels, input.languages ?? [])));
  } else if (input.languages !== void 0) {
    set("languages", serialiseLabels(input.languages));
  }
  if (input.mobility !== void 0) {
    const mob = cleanMobility(input.mobility);
    set("mobility", JSON.stringify(mob));
    set("remote_ok", mobilityHasRemote(mob) ? 1 : 0);
  }
  if (input.work_regime !== void 0) {
    set("work_regime", JSON.stringify(cleanWorkRegime(input.work_regime)));
  }
  if (input.notice_period !== void 0)
    set("notice_period", cleanNoticePeriod(input.notice_period));
  if (input.certifications !== void 0)
    set("certifications", serialiseLabels(input.certifications));
  if (input.daily_rate !== void 0) set("daily_rate", input.daily_rate);
  if (input.availability !== void 0) set("availability", input.availability);
  if (input.available_from !== void 0) set("available_from", input.available_from);
  if (input.location !== void 0) set("location", input.location);
  if (input.remote_ok !== void 0) set("remote_ok", input.remote_ok ? 1 : 0);
  if (input.freelancer_note !== void 0) set("freelancer_note", input.freelancer_note);
  if (fields.length) {
    await run(
      c.env.DB,
      `UPDATE profiles SET ${fields.join(", ")}, updated_at = datetime('now'),
         last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      ...params,
      contact.id
    );
  }
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "profile_updated",
    summary: "Updated their own profile",
    detail: Object.keys(input).join(", ")
  });
  return c.json({ ok: true, profile: await loadProfile(c.env.DB, contact.id) });
});
portalRoutes.post("/confirm-availability", async (c) => {
  const contact = c.get("contact");
  const { availability, available_from } = external_exports.object({
    availability: external_exports.enum(["now", "from_date", "not_available"]).optional(),
    available_from: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  }).parse(await c.req.json().catch(() => ({})));
  if (availability) {
    await run(
      c.env.DB,
      `UPDATE profiles SET availability = ?, available_from = ?, updated_at = datetime('now'),
         last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      availability,
      availability === "from_date" ? available_from ?? null : null,
      contact.id
    );
  } else {
    await run(
      c.env.DB,
      `UPDATE profiles SET last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      contact.id
    );
  }
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "availability_confirmed",
    summary: availability ? `Set availability to ${availability}` : "Confirmed availability is current"
  });
  return c.json({ ok: true });
});
portalRoutes.post("/cv", async (c) => {
  const contact = c.get("contact");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.");
  if (file.size === 0) throw badRequest("That file is empty.");
  if (file.size > MAX_CV_BYTES) {
    throw badRequest(
      `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB.`
    );
  }
  if (!isAcceptableCv(file.name, file.type)) {
    throw badRequest("Please upload a PDF or Word document.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putCv(c.env.DB, contact.id, bytes);
  const mime = ALLOWED_CV_TYPES[file.type] ? file.type : "application/octet-stream";
  await run(
    c.env.DB,
    `UPDATE profiles SET cv_filename = ?, cv_mime = ?, cv_size = ?, cv_uploaded_at = datetime('now'),
       updated_at = datetime('now') WHERE contact_id = ?`,
    file.name.slice(0, 200),
    mime,
    bytes.length,
    contact.id
  );
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "cv_uploaded",
    summary: `Uploaded a CV (${file.name.slice(0, 100)})`
  });
  return c.json({ ok: true, filename: file.name, size: bytes.length });
});
portalRoutes.get("/cv", async (c) => {
  const contact = c.get("contact");
  const meta = await first(
    c.env.DB,
    `SELECT cv_filename, cv_mime FROM profiles WHERE contact_id = ?`,
    contact.id
  );
  const bytes = await getCv(c.env.DB, contact.id);
  if (!bytes || !meta?.cv_filename) throw notFound("No CV on file");
  return cvResponse(bytes, meta.cv_filename, meta.cv_mime);
});
portalRoutes.delete("/cv", async (c) => {
  const contact = c.get("contact");
  await deleteCv(c.env.DB, contact.id);
  await run(
    c.env.DB,
    `UPDATE profiles SET cv_filename = NULL, cv_mime = NULL, cv_size = NULL, cv_uploaded_at = NULL,
       updated_at = datetime('now') WHERE contact_id = ?`,
    contact.id
  );
  await logActivity(c.env.DB, { contactId: contact.id, kind: "note", summary: "Removed their CV" });
  return c.json({ ok: true });
});
portalRoutes.post("/consent", async (c) => {
  const contact = c.get("contact");
  const { purpose, granted } = external_exports.object({
    purpose: external_exports.enum(["mission_alerts", "news"]),
    granted: external_exports.boolean()
  }).parse(await c.req.json());
  await recordConsent(c.env, {
    contactId: contact.id,
    purpose,
    granted,
    source: "profile_page",
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: (c.req.header("user-agent") ?? "").slice(0, 300)
  });
  return c.json({ ok: true, consents: await currentConsents(c.env.DB, contact.id) });
});
portalRoutes.get("/export", async (c) => {
  const contact = c.get("contact");
  const [full, profile, consents, activity] = await Promise.all([
    first(
      c.env.DB,
      // Explicit columns, never SELECT *: internal_notes is staff commentary and
      // a future column must not publish itself into this download by default.
      `SELECT id, email, first_name, last_name, phone, linkedin_url, source, stage,
              outreach_count, first_outreach_at, last_outreach_at, created_at
       FROM contacts WHERE id = ?`,
      contact.id
    ),
    loadProfile(c.env.DB, contact.id),
    consentHistory(c.env.DB, contact.id),
    all(
      c.env.DB,
      // Staff-authored notes are excluded: the "note" kind is where a recruiter's
      // private commentary is stored, and a self-service download is not the
      // place to hand it over. A formal access request still covers it.
      `SELECT kind, summary, detail, created_at FROM activity
       WHERE contact_id = ? AND kind != 'note' ORDER BY created_at`,
      contact.id
    )
  ]);
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "exported",
    summary: "Downloaded their own data"
  });
  const payload = {
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    contact: full,
    profile,
    consents,
    activity,
    note: "Your CV is a separate download from your profile page."
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nexian-my-data.json"`
    }
  });
});
portalRoutes.post("/delete", async (c) => {
  const contact = c.get("contact");
  await suppressContact(c.env, {
    contactId: contact.id,
    reason: "Profile deleted by the freelancer",
    source: "profile_page"
  });
  await deleteCv(c.env.DB, contact.id);
  await run(c.env.DB, `DELETE FROM profiles WHERE contact_id = ?`, contact.id);
  await run(
    c.env.DB,
    `UPDATE contacts
       SET first_name = '', last_name = '', phone = NULL, linkedin_url = NULL,
           email = 'deleted+' || id || '@invalid', internal_notes = NULL,
           stage = 'closed', suppressed = 1, suppressed_at = datetime('now'),
           suppressed_reason = 'Deleted by the freelancer',
           anonymized_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    contact.id
  );
  await revokeTokens(c.env.DB, contact.id);
  await revokePortalSessions(c.env.DB, contact.id);
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "deleted",
    summary: "Profile deleted at the freelancer's request"
  });
  endPortalSession(c);
  return c.json({ ok: true });
});
portalRoutes.post("/logout", (c) => {
  endPortalSession(c);
  return c.json({ ok: true });
});

// src/worker/lib/prefill.ts
function canAdoptPrefill(input) {
  if (input.existingId && input.existingId !== input.tokenContactId) return false;
  if (input.tokenContactEmail && input.tokenContactEmail !== input.submittedEmail) return false;
  return true;
}
__name(canAdoptPrefill, "canAdoptPrefill");

// src/worker/modules/publicsite/routes.ts
var publicRoutes = new Hono2();
var registerSchema = external_exports.object({
  email: external_exports.string().email().max(200),
  first_name: external_exports.string().trim().min(1).max(80),
  last_name: external_exports.string().trim().min(1).max(80),
  phone: external_exports.string().trim().max(40).optional(),
  linkedin_url: external_exports.string().trim().max(300).optional(),
  headline: external_exports.string().trim().max(200).optional(),
  years_experience: external_exports.number().int().min(0).max(70).optional(),
  years_relevant: external_exports.number().int().min(0).max(70).optional(),
  skills: external_exports.array(external_exports.string().trim().min(1).max(80)).max(30).default([]),
  industries: external_exports.array(external_exports.string().trim().min(1).max(80)).max(30).default([]),
  languages: external_exports.array(external_exports.string().trim().min(1).max(40)).max(15).default([]),
  language_levels: external_exports.record(external_exports.string(), external_exports.string()).optional(),
  mobility: external_exports.array(external_exports.string()).max(10).optional(),
  work_regime: external_exports.array(external_exports.string()).max(4).optional(),
  notice_period: external_exports.string().max(30).optional(),
  certifications: external_exports.array(external_exports.string().trim().min(1).max(120)).max(40).default([]),
  daily_rate: external_exports.number().int().min(0).max(1e4).optional(),
  availability: external_exports.enum(["now", "from_date", "not_available"]),
  available_from: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  location: external_exports.string().trim().max(120).optional(),
  remote_ok: external_exports.boolean().default(false),
  freelancer_note: external_exports.string().trim().max(2e3).optional(),
  consent_data_processing: external_exports.boolean(),
  consent_mission_alerts: external_exports.boolean().default(false),
  consent_news: external_exports.boolean().default(false),
  /** Personalised invitation token, when they arrived through their own link. */
  invite: external_exports.string().regex(/^[0-9a-f]{64}$/).optional()
});
publicRoutes.get("/taxonomy", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT kind, label FROM taxonomy WHERE active = 1 ORDER BY sort, label`
  );
  return c.json({
    skills: rows.filter((r) => r.kind === "skill").map((r) => r.label),
    industries: rows.filter((r) => r.kind === "industry").map((r) => r.label),
    languages: rows.filter((r) => r.kind === "language").map((r) => r.label),
    certifications: rows.filter((r) => r.kind === "certification").map((r) => r.label),
    policyVersion: c.env.PRIVACY_POLICY_VERSION,
    companyName: c.env.COMPANY_NAME
  });
});
async function readRegistration(c) {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const raw2 = form.get("profile");
    if (typeof raw2 !== "string") throw badRequest("Missing registration details.");
    let parsed;
    try {
      parsed = JSON.parse(raw2);
    } catch {
      throw badRequest("Could not read the registration details.");
    }
    const file = form.get("cv");
    return {
      input: registerSchema.parse(parsed),
      cv: file instanceof File && file.size > 0 ? file : null
    };
  }
  return { input: registerSchema.parse(await c.req.json()), cv: null };
}
__name(readRegistration, "readRegistration");
publicRoutes.post("/register", async (c) => {
  const ip = clientIp(c.req.raw.headers);
  const throttle = await hitRateLimit(c.env.DB, RATE_LIMITS.register, `ip:${ip}`);
  if (!throttle.allowed) {
    throw tooManyRequests("Too many registrations from this connection. Please try again later.");
  }
  const { input, cv } = await readRegistration(c);
  if (!input.consent_data_processing) {
    throw badRequest(
      "We can only store your profile if you agree to the first checkbox.",
      "consent_required"
    );
  }
  if (input.availability === "from_date" && !input.available_from) {
    throw badRequest("Please give the date you become available.", "date_required");
  }
  const levels = cleanLanguageLevels(input.language_levels);
  const mobility = cleanMobility(input.mobility);
  const workRegime = cleanWorkRegime(input.work_regime);
  const noticePeriod = cleanNoticePeriod(input.notice_period);
  const remoteOk = mobilityHasRemote(mobility) || input.remote_ok === true;
  if (cv && !isAcceptableCv(cv.name, cv.type)) {
    throw badRequest("Please upload a PDF or Word document as your CV.");
  }
  if (cv && cv.size > MAX_CV_BYTES) {
    throw badRequest(
      `That CV is ${(cv.size / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB.`
    );
  }
  const email = input.email.trim().toLowerCase();
  const liKey = linkedinKey(input.linkedin_url);
  let existing = await first(
    c.env.DB,
    `SELECT id, suppressed FROM contacts WHERE email = ?`,
    email
  );
  if (!existing && liKey) {
    existing = await first(
      c.env.DB,
      `SELECT id, suppressed FROM contacts
       WHERE linkedin_key = ? AND email IS NULL AND anonymized_at IS NULL`,
      liKey
    );
  }
  let inviteChannel = null;
  let tokenBound = false;
  if (input.invite) {
    const tokenRow = await peekActionToken(c.env.DB, input.invite);
    if (tokenRow?.purpose === "join_prefill" && tokenRow.contact_id) {
      const tokenContact = await first(
        c.env.DB,
        `SELECT id, suppressed, email FROM contacts WHERE id = ? AND anonymized_at IS NULL`,
        tokenRow.contact_id
      );
      if (tokenContact && canAdoptPrefill({
        existingId: existing?.id ?? null,
        tokenContactId: tokenContact.id,
        tokenContactEmail: tokenContact.email?.toLowerCase() ?? null,
        submittedEmail: email
      })) {
        existing = { id: tokenContact.id, suppressed: tokenContact.suppressed };
        tokenBound = true;
        try {
          inviteChannel = JSON.parse(tokenRow.payload).channel ?? null;
        } catch {
          inviteChannel = null;
        }
      }
    }
  }
  const hadProfile = existing ? Boolean(
    await first(
      c.env.DB,
      `SELECT contact_id FROM profiles WHERE contact_id = ?`,
      existing.id
    )
  ) : false;
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  const answered = /* @__PURE__ */ __name(() => c.json({ ok: true }), "answered");
  if (existing && existing.suppressed === 1) {
    if (!tokenBound) {
      log.info("public.register_suppressed", { contact: existing.id });
      return answered();
    }
    const identity = await first(
      c.env.DB,
      `SELECT email, linkedin_key FROM contacts WHERE id = ?`,
      existing.id
    );
    if (identity?.email) await unsuppressEmail(c.env.DB, identity.email);
    await unsuppressEmail(c.env.DB, email);
    if (identity?.linkedin_key) await unsuppressLinkedin(c.env.DB, identity.linkedin_key);
    if (liKey) await unsuppressLinkedin(c.env.DB, liKey);
    await run(
      c.env.DB,
      `UPDATE contacts SET suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
         updated_at = datetime('now') WHERE id = ?`,
      existing.id
    );
    await logActivity(c.env.DB, {
      contactId: existing.id,
      kind: "note",
      summary: "Suppression lifted: they registered through their own invitation link"
    });
  }
  if (existing && hadProfile) {
    const raw3 = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: existing.id
    });
    const mail2 = portalLinkEmail(ctx, {
      firstName: input.first_name,
      portalUrl: `${baseUrl}/a/${raw3}`
    });
    await sendEmail(c.env, {
      to: email,
      subject: mail2.subject,
      html: mail2.html,
      template: "portal_link",
      contactId: existing.id
    });
    return answered();
  }
  const contactId = existing?.id ?? uid();
  if (existing) {
    await run(
      c.env.DB,
      `UPDATE contacts
         SET email = COALESCE(email, ?), first_name = ?, last_name = ?, phone = COALESCE(?, phone),
             linkedin_url = COALESCE(?, linkedin_url),
             linkedin_key = COALESCE(?, linkedin_key),
             stage = CASE WHEN stage IN ('prospect', 'contacted') THEN 'registered' ELSE stage END,
             updated_at = datetime('now')
       WHERE id = ?`,
      email,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
      liKey,
      contactId
    );
  } else {
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'self_signup', 'registered')`,
      contactId,
      email,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
      liKey
    );
  }
  await run(
    c.env.DB,
    `INSERT INTO profiles (contact_id, headline, years_experience, years_relevant, skills, industries,
       languages, language_levels, mobility, work_regime, notice_period, certifications,
       daily_rate, availability, available_from, location, remote_ok, freelancer_note,
       last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    contactId,
    input.headline ?? "",
    input.years_experience ?? null,
    input.years_relevant ?? null,
    serialiseLabels(input.skills),
    serialiseLabels(input.industries),
    serialiseLabels(languagesFromLevels(levels, input.languages)),
    JSON.stringify(levels),
    JSON.stringify(mobility),
    JSON.stringify(workRegime),
    noticePeriod,
    serialiseLabels(input.certifications),
    input.daily_rate ?? null,
    input.availability,
    input.available_from ?? null,
    input.location ?? null,
    remoteOk ? 1 : 0,
    input.freelancer_note ?? null
  );
  if (cv) {
    const bytes = new Uint8Array(await cv.arrayBuffer());
    await putCv(c.env.DB, contactId, bytes);
    await run(
      c.env.DB,
      `UPDATE profiles SET cv_filename = ?, cv_mime = ?, cv_size = ?, cv_uploaded_at = datetime('now')
       WHERE contact_id = ?`,
      cv.name.slice(0, 200),
      ALLOWED_CV_TYPES[cv.type] ? cv.type : "application/octet-stream",
      bytes.length,
      contactId
    );
    await logActivity(c.env.DB, {
      contactId,
      kind: "cv_uploaded",
      summary: "Uploaded a CV with their registration"
    });
  }
  await recordConsents(
    c.env,
    contactId,
    {
      data_processing: true,
      mission_alerts: input.consent_mission_alerts,
      news: input.consent_news
    },
    {
      source: "registration_form",
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: (c.req.header("user-agent") ?? "").slice(0, 300)
    }
  );
  await logActivity(c.env.DB, {
    contactId,
    kind: "registered",
    // The channel attribution the whole personalised-link exercise exists for.
    summary: inviteChannel === "email" ? "Registered through their email invitation link" : inviteChannel === "linkedin" ? "Registered through their LinkedIn invitation link" : "Registered through the public form",
    detail: `availability=${input.availability} rate=${input.daily_rate ?? "-"}`
  });
  await revokeTokens(c.env.DB, contactId, "join_prefill");
  const consentSummary = [PURPOSE_LABEL.data_processing];
  if (input.consent_mission_alerts) consentSummary.push(PURPOSE_LABEL.mission_alerts);
  if (input.consent_news) consentSummary.push(PURPOSE_LABEL.news);
  const raw2 = await createActionToken(c.env.DB, { purpose: "portal_link", contactId });
  const mail = welcomeEmail(ctx, {
    firstName: input.first_name,
    portalUrl: `${baseUrl}/a/${raw2}`,
    consentSummary
  });
  await sendEmail(c.env, {
    to: email,
    subject: mail.subject,
    html: mail.html,
    template: "welcome",
    contactId
  });
  log.info("public.registered", { contact: contactId, withCv: Boolean(cv) });
  return answered();
});
publicRoutes.post("/request-link", async (c) => {
  const { email } = external_exports.object({ email: external_exports.string().email() }).parse(await c.req.json());
  const target = email.trim().toLowerCase();
  const ip = clientIp(c.req.raw.headers);
  const checks = [
    await hitRateLimit(c.env.DB, RATE_LIMITS.linkPerEmail, `email:${target}`),
    await hitRateLimit(c.env.DB, RATE_LIMITS.linkPerIp, `ip:${ip}`)
  ];
  if (checks.some((check) => !check.allowed)) {
    log.info("public.link_rate_limited", { ip });
    return c.json({ ok: true });
  }
  const contact = await first(
    c.env.DB,
    `SELECT ct.id, ct.first_name FROM contacts ct
     JOIN profiles p ON p.contact_id = ct.id
     WHERE ct.email = ? AND ct.anonymized_at IS NULL`,
    email.trim().toLowerCase()
  );
  if (contact) {
    const baseUrl = await resolveBaseUrl(c.env);
    const raw2 = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: contact.id
    });
    const mail = portalLinkEmail(
      { companyName: c.env.COMPANY_NAME, baseUrl },
      { firstName: contact.first_name, portalUrl: `${baseUrl}/a/${raw2}` }
    );
    await sendEmail(c.env, {
      to: email.trim().toLowerCase(),
      subject: mail.subject,
      html: mail.html,
      template: "portal_link",
      contactId: contact.id
    });
  }
  return c.json({ ok: true });
});
publicRoutes.get("/join-prefill", async (c) => {
  const token = c.req.query("token") ?? "";
  const row = await peekActionToken(c.env.DB, token);
  if (!row || row.purpose !== "join_prefill" || !row.contact_id) {
    return c.json({ valid: false });
  }
  const contact = await first(
    c.env.DB,
    `SELECT ct.id, ct.first_name, ct.last_name, ct.email, ct.linkedin_url,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ? AND ct.anonymized_at IS NULL`,
    row.contact_id
  );
  if (!contact) return c.json({ valid: false });
  const stamped = await run(
    c.env.DB,
    `UPDATE action_tokens SET used_at = datetime('now')
     WHERE token_hash = ? AND used_at IS NULL`,
    row.token_hash
  );
  if (stamped.meta.changes) {
    let channel = null;
    try {
      channel = JSON.parse(row.payload).channel ?? null;
    } catch {
      channel = null;
    }
    await logActivity(c.env.DB, {
      contactId: contact.id,
      kind: "note",
      channel,
      summary: `Opened their invitation link${channel ? ` (${channel})` : ""}`
    });
  }
  if (contact.has_profile > 0) {
    return c.json({
      valid: true,
      alreadyRegistered: true,
      first_name: contact.first_name,
      email: contact.email
    });
  }
  return c.json({
    valid: true,
    alreadyRegistered: false,
    prefill: {
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      linkedin_url: contact.linkedin_url
    }
  });
});

// src/worker/index.ts
var app = new Hono2();
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return c.json({ error: "validation", message }, 400);
  }
  log.error("unhandled_error", {
    path: c.req.path,
    method: c.req.method,
    error: err.message,
    stack: err.stack?.split("\n").slice(0, 5).join(" | ")
  });
  return c.json(
    { error: "internal", message: "Something went wrong \u2014 the error has been logged." },
    500
  );
});
app.use("*", async (c, next) => {
  c.executionCtx?.waitUntil?.(rememberOrigin(c.env, c.req.url).catch(() => {
  }));
  await next();
  harden(c.res.headers);
});
app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true, env: c.env.APP_ENV, db: "ok" });
  } catch (e) {
    log.error("health.db_unreachable", { error: e instanceof Error ? e.message : String(e) });
    return c.json({ ok: false, env: c.env.APP_ENV, db: "unreachable" }, 503);
  }
});
app.route("/a", actionRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/portal", portalRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/ext", extRoutes);
app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path.startsWith("/api/public/") || path.startsWith("/api/portal/") || // Signed by the provider instead: a session cookie is meaningless here.
  path.startsWith("/api/webhooks/") || // Bearer-token authed; note the trailing slash keeps /api/exttokens (session
  // authed, managed below) out of this bypass.
  path.startsWith("/api/ext/") || path === "/api/health") {
    return next();
  }
  return requireAuth()(c, next);
});
app.route("/api/contacts", contactRoutes);
app.route("/api/outreach", outreachRoutes);
app.route("/api/exttokens", extTokenRoutes);
app.route("/api/pool", poolRoutes);
app.route("/api/campaigns", campaignRoutes);
app.route("/api/admin", adminRoutes);
app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found", message: "Unknown API route" }, 404);
  }
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  const res = new Response(asset.body, asset);
  harden(res.headers);
  return res;
});
var index_default = {
  fetch: app.fetch,
  scheduled: /* @__PURE__ */ __name(async (_event, env, ctx) => {
    ctx.waitUntil(runScheduledJobs(env));
  }, "scheduled"),
  /**
   * Incoming email. Inert until Email Routing on a real domain is pointed at
   * this Worker — see modules/inbound/email.ts for the three steps.
   */
  email: /* @__PURE__ */ __name(async (message, env) => {
    await handleInboundEmail(message, env);
  }, "email")
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
