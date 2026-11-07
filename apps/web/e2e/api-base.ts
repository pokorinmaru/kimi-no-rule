// Where the e2e build of the app sends its server calls: a port nobody listens on, so a local server running with
// a key never changes the flow under test. Specs that play the server route this address (run-through, 2026-11-08).
export const E2E_API_BASE = "http://127.0.0.1:9";
