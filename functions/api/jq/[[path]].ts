/**
 * Cloudflare Pages Functions - J-Quants API Reverse Proxy
 * ブラウザからのCORS制限（OPTIONSリクエスト403）を解消し、
 * /api/jq/* へのリクエストを https://api.jquants.com/v2/* に中継します。
 */

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  // /api/jq/xxx -> /xxx
  const targetPath = url.pathname.replace(/^\/api\/jq/, '');
  const targetUrl = `https://api.jquants.com/v2${targetPath}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.set('Host', 'api.jquants.com');

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD' ? context.request.body : undefined,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
