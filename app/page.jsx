import { Suspense, cacheSignal } from 'react';
import { connection } from 'next/server';

async function Work({ id, mode }) {
  const signal = cacheSignal();
  console.log(`RSC_SIGNAL ${id} ${Boolean(signal)}`);
  signal?.addEventListener('abort', () => console.log(`RSC_ABORT ${id} ${signal.reason?.name}`));
  const response = await fetch(`${process.env.BACKEND_URL}/work?id=${id}`, {
    cache: 'no-store',
    ...(mode === 'explicit' ? { signal } : {}),
  });
  return <div>{await response.text()}</div>;
}

export default async function Page({ searchParams }) {
  await connection();
  const { id, mode = 'explicit', streaming } = await searchParams;
  if (streaming === '1') {
    return <Suspense fallback={<p>Loading</p>}><Work id={id} mode={mode} /></Suspense>;
  }
  return <Work id={id} mode={mode} />;
}
