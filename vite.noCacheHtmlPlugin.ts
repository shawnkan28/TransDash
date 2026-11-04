import type { Connect, Plugin } from 'vite';

/** Prevent browsers from caching index.html in dev/preview (stale HTML → wrong JS paths). */
function attachNoCacheHtmlHeaders(middlewares: Connect.Server) {
  middlewares.use((req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    const isHtmlEntry = url === '/' || url === '/index.html';

    if (isHtmlEntry) {
      const end = res.end.bind(res);
      res.end = ((chunk?: unknown, ...args: unknown[]) => {
        if (!res.headersSent) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        return end(chunk as never, ...(args as []));
      }) as typeof res.end;
    }

    next();
  });
}

export function noCacheHtmlPlugin(): Plugin {
  return {
    name: 'no-cache-html',
    configureServer(server) {
      attachNoCacheHtmlHeaders(server.middlewares);
    },
    configurePreviewServer(server) {
      attachNoCacheHtmlHeaders(server.middlewares);
    },
  };
}
