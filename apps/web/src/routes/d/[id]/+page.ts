import type { PageLoad } from './$types';

// Decryption uses the URL fragment (#k=…) which is never sent to the server.
// SSR is therefore disabled — all work happens in the browser.
export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  return { id: params.id };
};
