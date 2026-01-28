// supabase-shim.js
// Try multiple CDN endpoints (in order) using top-level await so that
// modules importing { createClient } get a ready-to-use function.
// This reduces "error loading dynamically imported module" caused by
// a single CDN outage. If none of the CDNs respond, this module will
// throw and the app will show an import error in the console.

const CDN_URLS = [
	'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/esm/index.js',
	'https://unpkg.com/@supabase/supabase-js/dist/esm/index.js',
	'https://esm.sh/@supabase/supabase-js'
];

let supabaseModule = null;
let lastError = null;
for (const url of CDN_URLS) {
	try {
		// eslint-disable-next-line no-await-in-loop
		const m = await import(url);
		if (m) { supabaseModule = m; break; }
	} catch (err) {
		// remember last error and try next CDN
		lastError = err;
		// continue to next URL
	}
}

if (!supabaseModule) {
	console.error('Failed to load @supabase/supabase-js from CDNs. Last error:', lastError);
	throw new Error('Unable to load supabase client from CDNs');
}

// Export the createClient function and default module if present
export const createClient = supabaseModule.createClient || (supabaseModule.default && supabaseModule.default.createClient);
export default supabaseModule.default || supabaseModule;
