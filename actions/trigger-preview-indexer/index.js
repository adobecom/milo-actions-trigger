import actionHelper from '../internal/action.js';

const actionMain = async (actionTools) => {
  const { request, response, runtime: { github } } = actionTools;
  const githubEventsCSV = request.getActionParams('githubEvents');
  const githubEvents = githubEventsCSV?.split(',')?.map(event => event.trim()) || [];

  if (githubEvents.length === 0) {
    return response.successResponse({ githubRequestIds: [] });
  }

  const githubRequestIds = await github.dispatchWorkflow(
    githubEvents,
    'adobecom/milo',
  );
  
  return response.successResponse({ githubRequestIds });
};

const main = (async (params) => actionHelper(params, actionMain));
// eslint-disable-next-line import/prefer-default-export
export { main };