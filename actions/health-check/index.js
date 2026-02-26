import actionHelper from '../internal/action.js';

const RUNNING_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const DEFAULT_WARNING_THRESHOLD_MINUTES = 60;
const DEFAULT_ERROR_THRESHOLD_MINUTES = 120;
const DEFAULT_REPO = 'adobecom/milo';
const MAX_CONSECUTIVE_FAILED_RUNS = 10;

const getPositiveInteger = (value, fallbackValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallbackValue : parsed;
};

const toEventTypes = (eventTypesCsv) => eventTypesCsv
  ?.split(',')
  ?.map((eventType) => eventType.trim())
  ?.filter(Boolean) || [];

const isFailedRun = (run) => run?.conclusion === 'failure';

const isRunInMinutesWindow = (run, thresholdMinutes) => {
  const candidateTimestamp = run?.run_started_at || run?.created_at || run?.updated_at;
  if (!candidateTimestamp) {
    return false;
  }

  const runMs = Date.parse(candidateTimestamp);
  if (Number.isNaN(runMs)) {
    return false;
  }

  const thresholdMs = thresholdMinutes * 60 * 1000;
  return (Date.now() - runMs) <= thresholdMs;
};

const countConsecutiveFailedRuns = (runs = []) => {
  let failedRuns = 0;
  for (const run of runs) {
    if (isFailedRun(run)) {
      failedRuns += 1;
      continue;
    }
    break;
  }
  return failedRuns;
};

const buildEventStatus = (eventType, runs, errorThresholdMinutes) => {
  const isRunning = runs.some((run) => RUNNING_STATUSES.has(run?.status));
  const consecutiveFailedRuns = countConsecutiveFailedRuns(runs);
  const hasRecentRun = runs.some((run) => isRunInMinutesWindow(run, errorThresholdMinutes));

  const checks = {
    isRunning,
    hasNoMoreThanTenConsecutiveFailedRuns: consecutiveFailedRuns <= MAX_CONSECUTIVE_FAILED_RUNS,
    hasRecentRun,
  };

  return {
    eventType,
    checks,
    consecutiveFailedRuns,
    runCount: runs.length,
    status: Object.values(checks).every(Boolean) ? 'pass' : 'failed',
  };
};

const actionMain = async (actionTools) => {
  const { request, response, runtime: { github } } = actionTools;
  const githubEvents = toEventTypes(request.getActionParams('githubEvents'));
  const repo = request.getActionParams('githubRepo') || DEFAULT_REPO;
  const warningThresholdMinutes = getPositiveInteger(
    request.getActionParams('warningThresholdMinutes'),
    DEFAULT_WARNING_THRESHOLD_MINUTES,
  );
  const errorThresholdMinutes = getPositiveInteger(
    request.getActionParams('errorThresholdMinutes'),
    DEFAULT_ERROR_THRESHOLD_MINUTES,
  );

  if (githubEvents.length === 0) {
    return response.successResponse({
      status: 'pass',
      details: {}
    });
  }

  const workflowRunsArrays = await Promise.all(
    githubEvents.map((eventType) => github.getRepositoryDispatchRuns(repo, eventType))
  );

  const eventStatuses = githubEvents.map((eventType, index) => (
    buildEventStatus(eventType, workflowRunsArrays[index] || [], errorThresholdMinutes)
  ));

  const overallStatus = eventStatuses.every((eventStatus) => eventStatus.status === 'pass') ? 'pass' : 'failed';

  return response.successResponse({
    status: overallStatus,
    events: eventStatuses,
    errorThresholdMinutes,
    warningThresholdMinutes,
    repo,
  });
};

const main = (async (params) => actionHelper(params, actionMain));
// eslint-disable-next-line import/prefer-default-export
export { main };
