// E2E-encrypted file sharing renders entirely in the browser:
// no SSR avoids leaking decryption state to the server and sidesteps
// svelte-i18n's async-locale-init issue during server rendering.
export const ssr = false;
export const prerender = false;
