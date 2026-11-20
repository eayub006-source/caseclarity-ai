// Vite (the Cloudflare build, via vinext) replaces import.meta.env at build
// time; under `next dev` / `next build` it is undefined. Only SSR is used.
interface ImportMetaEnv { readonly SSR?: boolean }
interface ImportMeta { readonly env?: ImportMetaEnv }
