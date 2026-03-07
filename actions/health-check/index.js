import actionHelper from '../internal/action.js';

const DEFAULT_WARNING_THRESHOLD_MINUTES = 60;
const DEFAULT_ERROR_THRESHOLD_MINUTES = 120;
const DEFAULT_REPO = 'adobecom/milo';
const DEFAULT_CONSECUTIVE_FAILED_RUNS = 10;

const getPositiveInteger = (request, key, fallbackValue) => {
  const value = request.getActionParams(key);
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallbackValue : parsed;
};

const toWorkflowFn = (eventTypesCsv) => eventTypesCsv
  ?.split(',')
  ?.map((eventType) => eventType.trim())
  ?.filter(Boolean) || [];

const isFailedRun = (run) => run?.conclusion === 'failure';

const countConsecutiveFailures = (runs) => {
  let consecutiveFailures = 0;
  for (const run of runs) {
    if (!isFailedRun(run)) {
      break;
    }
    consecutiveFailures += 1;
  }
  return consecutiveFailures;
};

const actionMain = async (actionTools) => {
  const { request, response, runtime: { github } } = actionTools;
  const needDetails = !!request.getQueryParameter('details', '')
  const ghWorkflowFns = toWorkflowFn(request.getActionParams('ghWorkflowFilenames'));
  if (ghWorkflowFns.length === 0) {
    return response.successResponse({ status: 'pass' });
  }
  const repo = request.getActionParams('githubRepo') || DEFAULT_REPO;
  const warningThresholdMinutes = getPositiveInteger(request, 'warningThresholdMinutes', DEFAULT_WARNING_THRESHOLD_MINUTES);
  const errorThresholdMinutes = getPositiveInteger(request, 'errorThresholdMinutes', DEFAULT_ERROR_THRESHOLD_MINUTES);
  const consecutiveFailedRuns = getPositiveInteger(request, 'consecutiveFailedRuns', DEFAULT_CONSECUTIVE_FAILED_RUNS);

  const eventRunsResults = await Promise.all(
    ghWorkflowFns.map(async (workflowFn) => {
      const runs = await github.getRepositoryDispatchRuns(repo, workflowFn);
      const eventConsecutiveFailures = countConsecutiveFailures(runs);
      const consecutiveFailureStatus = eventConsecutiveFailures >= consecutiveFailedRuns ? 'fail' : 'pass';
      const lastRunAt = runs?.[0]?.started_at_ms || new Date(0).getTime();
      const currentDate = Date.now();
      let lastRunStatus = 'pass';
      if (lastRunAt < currentDate - errorThresholdMinutes * 60 * 1000) {
        lastRunStatus = 'fail';
      } else if (lastRunAt < currentDate - warningThresholdMinutes * 60 * 1000) {
        lastRunStatus = 'warn';
      }
      return [workflowFn, { runs, consecutiveFailureStatus, lastRunStatus, lastRunAt, eventConsecutiveFailures }];
    })
  );

  const eventRunDetails = Object.fromEntries(eventRunsResults);

  const getOverallStatus = (data) => {
    const statuses = Object.values(data).flatMap(w => [
      w.consecutiveFailureStatus || 'warn',
      w.lastRunStatus || 'warn'
    ]);

    if (statuses.includes("fail")) return "fail";
    if (statuses.includes("warn")) return "warn";
    return "pass";
  };

  const finalResponse = {};
  finalResponse.status = getOverallStatus(eventRunDetails);
  if (needDetails) {
    finalResponse.eventRunDetails = eventRunDetails;
  }

  return response.successResponse(finalResponse);
};

const main = (async (params) => actionHelper(params, actionMain));
// eslint-disable-next-line import/prefer-default-export
export { main };
