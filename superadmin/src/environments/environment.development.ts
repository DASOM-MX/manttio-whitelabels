// Local API target. A live-API override here stays local-only — same
// `git update-index --skip-worktree` convention as frontend (root CLAUDE.md).
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8788',
  bypassAuthGuard: false,
};
