import jwt from "jsonwebtoken";

const isSuccessful = (httpCode) => httpCode >= 200 && httpCode < 300;

const throwError = (message, status) => {
  logger.error(message);
  const error = new Error(message);
  error.sendMessage = message;
  error.sendStatus = status;
  throw error;
}

const githubHelper = (axiosWithRetry, logger) => {
  let clientId;
  let clientSecret;

  const self = {};

  self.init = (cid, cs) => {
    if (!cid || !cs) {
      throwError('Client ID and Client Secret are required', 400);
    }
    clientId = cid;
    clientSecret = cs;
  }

  const generateGitHubAppJWT = () => {
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 600,
      iss: clientId
    };
    return jwt.sign(payload, Buffer.from(clientSecret, 'utf-8'), { algorithm: "RS256" });
  }

  const getAppId = async (jwtToken) => {
    const applMetadata = await axiosWithRetry.get(
      'https://api.github.com/app/installations', {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!isSuccessful(applMetadata.status)) {
      throwError(`GitHub API returned status ${applMetadata.status}`, 500);
    }
    logger.info(`Metadata length: ${applMetadata.data?.length}`);
    const applId = applMetadata.data?.[0].id;
    logger.info(`Application ID: ${applId}`);
    return applId;
  }

  const getAppAccessToken = async (applId, jwtToken) => {
    const applAccessTokens = await axiosWithRetry.post(
      `https://api.github.com/app/installations/${applId}/access_tokens`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Accept': 'application/vnd.github+json'
        },
      }
    );

    if (!isSuccessful(applAccessTokens.status)) {
      throwError(`GitHub API returned status ${applAccessTokens.status}`, 500);
    }

    const { expires_at = '', token = '' } = applAccessTokens.data;
    logger.info(`Access token available: ${expires_at} (Size - ${token.length})`);
    return token;
  }

  const getGitHubToken = async () => {
    const jwtToken = generateGitHubAppJWT(clientId, clientSecret);
    logger.info(`JWT token created: ${jwtToken.length}`);

    const applId = await getAppId(jwtToken);
    if (!applId) {
      throwError('No application ID found in metadata', 500);
    }

    const token = await getAppAccessToken(applId, jwtToken);
    if (!token) {
      throwError('Could not generate access token', 500);
    }

    return token;
  }

  self.dispatchWorkflow = async (eventTypes, repo) => {
    if (!eventTypes || eventTypes.length === 0) {
      throwError('Event types are required', 400);
    }

    const token = await getGitHubToken();

    const githubRequestIds = [];
    await Promise.all(eventTypes.map(async (eventType) => {
      const workflowDispatchResp = await axiosWithRetry.post(
        `https://api.github.com/repos/${repo}/dispatches`,
        {
          event_type: eventType
        },
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json'
          },
        }
      );

      if (!isSuccessful(workflowDispatchResp.status)) {
        throwError(`GitHub API returned status ${workflowDispatchResp.status}`, 500);
      }

      const githubRequestId = workflowDispatchResp.headers && workflowDispatchResp.headers['x-github-request-id'];
      logger.info(`GitHub Request ID: ${githubRequestId}`);
      githubRequestIds.push({ eventType, githubRequestId });
    }));

    return { githubRequestIds };
  }

  self.getRepositoryDispatchRuns = async (repo, workflowFn, perPage = 100) => {
    if (!repo) {
      throwError('Repository is required', 400);
    }

    const token = await getGitHubToken();

    const workflowRunsResp = await axiosWithRetry.get(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowFn}/runs`,
      {
        params: {
          event: 'repository_dispatch',
          per_page: perPage,
        },
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!isSuccessful(workflowRunsResp.status)) {
      throwError(`GitHub API returned status ${workflowRunsResp.status}`, 500);
    }

    const workflowRuns = workflowRunsResp.data?.workflow_runs || [];

    return workflowRuns
      .map(wr => ({
        id: wr.id,
        name: wr.name,
        status: wr.status,
        conclusion: wr.conclusion,
        display_title: wr.display_title,
        started_at_ms: new Date(wr.run_started_at || 0).getTime(),
      }))
      .sort((a, b) => b.started_at_ms - a.started_at_ms);
  };

  return self;
}

export default githubHelper;
