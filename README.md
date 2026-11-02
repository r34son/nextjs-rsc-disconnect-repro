# Next.js RSC client disconnect reproduction

Minimal self-hosted App Router example using only Next.js and React. A local backend intentionally keeps each request open until the test releases it.

```sh
npm install
npm run build
npm run repro
```

`repro` starts the production Next.js server and a loopback backend on ephemeral ports. It aborts the client after the backend receives the fetch, observes for 1.8 seconds, then releases the backend. It tests an RSC request before response headers, a streaming RSC request after the fallback is received, and a Route Handler with `request.signal` as a control. Both servers stop after the run.

The JSON output reports whether each upstream socket closed early, whether the React or Route Handler signal fired, and whether the backend completed after release. In the observed behavior, both RSC variants stay open during the observation period and finish after release; the Route Handler signal fires and its upstream socket closes early. A no-signal RSC variant is included as an additional control. `cache: 'no-store'` avoids an explicit persistent cache fill.
