

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.Lo7lqz5s.js","_app/immutable/chunks/Cn0D53UG.js","_app/immutable/chunks/C_Y_TGQ7.js"];
export const stylesheets = ["_app/immutable/assets/0.DVLv9rMJ.css"];
export const fonts = [];
