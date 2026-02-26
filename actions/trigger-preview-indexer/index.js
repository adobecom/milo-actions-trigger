import actionHelper from '../internal/action.js';

const actionMain = async (actionTools) => {
  const { request, response, runtime: { github } } = actionTools;
  const allowedNamespaces = request.getActionParams('allowedNamespaces') || '';

  const currentNs = process.env.__OW_NAMESPACE;
  if (!(new RegExp(allowedNamespaces).test(currentNs))) {
    return response.successResponse({ statusMessage: `Namespace ${currentNs} is not allowed as it does not classify ${allowedNamespaces}` });
  }

  const githubEventsCSV = request.getActionParams('githubEvents');
  const githubEvents = githubEventsCSV?.split(',')?.map(event => event.trim()) || [];

  if (githubEvents.length === 0) {
    return response.successResponse({ githubRequestIds: [] });
  }

  const githubRequestIds = await github.dispatchWorkflow(
    githubEvents,
    'adobecom/milo',
  );
  
  return response.successResponse({ githubRequestIds }, 202);
};

const main = (async (params) => actionHelper(params, actionMain));
// eslint-disable-next-line import/prefer-default-export
export { main };