import querystring from 'querystring';

const requestHelper = (actionParams, queryParams, originalMethod, headers) => {
    const method = `${originalMethod}`.toUpperCase();

    const getMethod = () => method;

    const isCorsPreflight = () => getMethod() === 'OPTIONS' && 'access-control-request-headers' in headers && 'access-control-request-method' in headers && 'origin' in headers;

    const getRequestCorsHeaders = () => ({
        corsMethod: headers['access-control-request-method'],
        corsHeaders: headers['access-control-request-headers'],
        origin: headers.origin,
    });

    const getQueryString = () => queryParams;

    let parsedParameters;
    const getParsedQueryParameters = () => {
        if (!parsedParameters) {
            parsedParameters = querystring.parse(queryParams);
        }
        return parsedParameters;
    };

    const getHeaderByName = (name) => headers[name.toLowerCase()];

    const getActionParams = (key) => key ? actionParams[key] : actionParams;

    return {
        getMethod,
        getQueryString,
        getParsedQueryParameters,
        getRequestCorsHeaders,
        isCorsPreflight,
        getHeaderByName,
        getActionParams,
    };
};

export default requestHelper;
