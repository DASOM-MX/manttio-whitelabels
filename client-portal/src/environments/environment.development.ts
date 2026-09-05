// Local API target, swapped in by `fileReplacements` under `ng serve`
// (angular.json → build:development). This is the rung that makes dev work:
// there is no Worker in front of the dev server, so `/__config` answers with
// the SPA shell and the fetch falls through to here.
//
// A live-API override in this file stays local-only — same
// `git update-index --skip-worktree` convention as superadmin and frontend
// (root CLAUDE.md).
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8788',
  turnstileSiteKey: '',
};
