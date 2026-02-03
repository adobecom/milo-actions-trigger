import { hrtime } from 'process';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import AioLogger from '@adobe/aio-lib-core-logging';
import requestHelper from './request.js';
import responseHelper from './response.js';
import githubHelper from './github.js';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

const actionHelper = async (params, actionMain, loggerName = 'main') => {
    const hrtimeToMillis = (time = [0, 0]) => Math.round(time[0] * 1e3 + time[1] / 1e6);
    const startTime = hrtime();
    const {
        __ow_query: queryParams = '',
        __ow_method: originalMethod = '',
        __ow_headers: headers = {},
        __ow_body: rawBody,
        LOG_LEVEL: logLevel = 'info',
        ...actionParams
    } = params;

    const logger = AioLogger(loggerName, { level: logLevel });
    const request = requestHelper(actionParams, queryParams, originalMethod, headers, rawBody);
    const response = responseHelper(request);
    const axiosWithRetry = createAxiosWithRetry(logger);    ;
    const github = githubHelper(axiosWithRetry, logger);
    github.init(actionParams.githubAppClientId, actionParams.githubAppClientSecret.replaceAll(/\\n/g, '\n'));

    if (request.isCorsPreflight()) {
        return response.corsResponse();
    }

    function createAxiosWithRetry(logger) {
        const axiosWithRetry = axios.create();
        axiosRetry(axiosWithRetry, {
            retries: RETRY_ATTEMPTS,
            retryDelay: (retryCount, error) => {
                logger.info(`Retry attempt ${retryCount}`);
                let retryAfter = RETRY_DELAY * 1000 * 2 ** (retryCount - 1);
                const respHeaders = error?.response?.headers;
                const retryAfterHeader = Number(respHeaders?.['retry-after'] || '');
                if (retryAfterHeader && !Number.isNaN(retryAfterHeader)) {
                    retryAfter = Number(retryAfterHeader) * 1000;
                }
                logger.info(`Delay of ${retryAfter}ms`);
                return retryAfter;
            },
            retryCondition: (error) => {
                const status = error.response?.status;
                const shouldRetry = [429, 500, 502, 503, 504].includes(status);
                if (shouldRetry) {
                    logger.info(`Request failed with status ${status}, will retry`);
                }
                return shouldRetry;
            },
        });
        
        return axiosWithRetry;
    }

    try {
        return await actionMain({
            request,
            response,
            runtime: {
                logger,
                axiosWithRetry,
                github,
            }
        });
    } catch (err) {
        const message = err.sendMessage ? `${err.sendMessage}: ${err.message}` : err.message;
        logger.error(`Action failed: ${message}\nStack:${err.stack}`);
        const errorCode = err.sendStatus ? err.sendStatus : 500;
        return response.errorResponse(message, errorCode);
    } finally {
        logger.info(`executed action in ${hrtimeToMillis(hrtime(startTime))}ms`);
    }
};

export default actionHelper;
