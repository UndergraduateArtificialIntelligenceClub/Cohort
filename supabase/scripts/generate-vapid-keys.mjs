// Makes the VAPID key pair for push notifications. Run once per Supabase project, from the Cohort folder:
//   node supabase/scripts/generate-vapid-keys.mjs
// It prints two things:
//   - VAPID_KEYS: the private + public key as JSON. Secret. Goes into the Edge Function's secrets only.
//   - VITE_VAPID_PUBLIC_KEY: the public key. Not secret. Goes into frontend/.env and the Vercel env vars.
// Making new keys later switches off notifications for everyone until they turn them on again.

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwks = {
  publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey),
  privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
};
const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");

console.log(`Edge Function secret (keep private):
supabase secrets set VAPID_KEYS='${JSON.stringify(jwks)}'

frontend/.env and Vercel (public):
VITE_VAPID_PUBLIC_KEY=${publicKey}`);
