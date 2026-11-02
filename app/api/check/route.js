export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  request.signal.addEventListener('abort', () => console.log(`ROUTE_ABORT ${id} ${request.signal.reason?.name}`));
  const response = await fetch(`${process.env.BACKEND_URL}/work?id=${id}`, { signal: request.signal });
  return new Response(await response.text());
}
