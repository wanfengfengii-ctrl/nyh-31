

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.ts";
export const imports = ["_app/immutable/nodes/2.D6rvzG6l.js","_app/immutable/chunks/Cn0D53UG.js","_app/immutable/chunks/C_Y_TGQ7.js","_app/immutable/chunks/CNKJPsqZ.js"];
export const stylesheets = [];
export const fonts = [];
