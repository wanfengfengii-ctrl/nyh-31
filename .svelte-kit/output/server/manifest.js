export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.k9mMaOBF.js",app:"_app/immutable/entry/app.C2fXT_P_.js",imports:["_app/immutable/entry/start.k9mMaOBF.js","_app/immutable/chunks/BdDfWB9r.js","_app/immutable/chunks/Cn0D53UG.js","_app/immutable/chunks/CNKJPsqZ.js","_app/immutable/entry/app.C2fXT_P_.js","_app/immutable/chunks/Cn0D53UG.js","_app/immutable/chunks/C_Y_TGQ7.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
