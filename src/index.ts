/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler deploy src/index.ts --name my-worker` to deploy your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import * as spec from './spec.json';
import { camelCase, filter, find } from 'lodash';
import { stringify } from 'json-bigint';
import { Buffer } from 'node:buffer';

export interface Env {
    // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
    // MY_KV_NAMESPACE: KVNamespace;
    //
    // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
    // MY_DURABLE_OBJECT: DurableObjectNamespace;
    //
    // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
    // MY_BUCKET: R2Bucket;
    //
    // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
    // MY_SERVICE: Fetcher;
}

// TODO use env to configure this
const networks = {
    mainnet: 'https://fullnode.mainnet.aptoslabs.com/v1',
    testnet: 'https://fullnode.testnet.aptoslabs.com/v1',
    devnet: 'https://fullnode.devnet.aptoslabs.com/v1',
};
const network = 'devnet';

/**
 * find path in spec by method
 * supported format example: get_ledger_info, getLedgerInfo, apt_getLedgerInfo
 * @param spec
 * @param method
 */
function findPath(spec: any, method: string) {
    for (const path in spec.paths) {
        for (const requestMethod in spec.paths[path]) {
            const operation = spec.paths[path][requestMethod]?.operationId;
            if (
                (!!operation && (operation === method || camelCase(operation) === method)) ||
                camelCase(operation) === method.replace('apt_', '')
            ) {
                return {
                    path,
                    requestMethod,
                    spec: spec.paths[path][requestMethod],
                };
            }
        }
    }
}

/**
 * jsonrpc params to request
 * transform principle:
 * 1. parameters in path are required as the first elements of params array
 * 2. request body is the next element of params array if present in spec
 * 3. parameters in query except ledger_version are the next element of params array, the element type is object if query parameters more than one
 * 4. parameter ledger_version in query are the last element of params array if present in spec which is optional
 * 5. support content-type application/x.aptos.signed_transaction+bcs request by use hex string in the params
 * @param params
 * @param spec
 * @param url
 * @param method
 */
function rpcParams2Request(params: any[], spec: any, url: string, method: string) {
    const requestInit: any = {
        method,
        headers: {
            'content-type': 'application/json',
        },
    };
    const pathParams = filter(spec?.parameters, (param: any) => param?.in === 'path');
    const queryParams = filter(spec?.parameters, (param: any) => param.name !== 'ledger_version' && param.in === 'query');
    const paramLedgerVersion = find(spec?.parameters, (param: any) => param.name === 'ledger_version' && param.in === 'query');

    for (const index in pathParams) {
        if (params[index] === undefined) {
            return new Error(`missing value for required argument ${index} ${pathParams[index].name}`);
        }
        url = url.replace(`{${pathParams[index].name}}`, params[index]);
    }
    let cursor = pathParams.length;
    if (!!spec?.requestBody) {
        const body = params[cursor];
        if (spec.requestBody.required && body === undefined) {
            return new Error(`missing value for required argument ${cursor}`);
        }

        // suppose body is for content type application/x.aptos.signed_transaction+bcs
        if (Object.keys(spec.requestBody?.content).length > 1 && typeof body === 'string') {
            requestInit.body = Buffer.from(body.replace('0x', ''), 'hex');
            requestInit.headers['content-type'] = 'application/x.aptos.signed_transaction+bcs';
        } else {
            requestInit.body = stringify(params[cursor]);
        }

        cursor++;
    }
    const query = new URLSearchParams();
    if (queryParams.length > 0 && !!params[cursor]) {
        if (queryParams.length === 1) {
            if (queryParams[0].required && params[cursor] === undefined) {
                return new Error(`missing value for required argument ${cursor} ${queryParams[0].name}`);
            }
            query.append(queryParams[0].name, params[cursor]);
        } else {
            queryParams.forEach((param: any) => {
                if (param.name in params[cursor]) {
                    if (param.required && params[cursor][param.name] === undefined) {
                        return new Error(`missing value for required argument ${cursor} ${param.name}`);
                    }
                    query.append(param.name, params[cursor][param.name]);
                }
            });
        }
        cursor++;
    }
    if (!!paramLedgerVersion && !!params[cursor]) {
        query.append('ledger_version', params[cursor]);
    }
    if (query.size > 0) {
        url += `?${query.toString()}`;
    }

    return new Request(url, requestInit);
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method !== 'POST' || new URL(request.url).pathname.length > 1) {
            return new Response(null, { status: 404 });
        }

        const response: any = {
            jsonrpc: '2.0',
            id: null,
        };
        const responseInit = {
            headers: {
                'content-type': 'application/json',
            },
        };

        let data: any;
        try {
            data = await request.json();
        } catch (error) {
            // do nothing
        }
        if (!data || !data?.method) {
            response.error = {
                code: -32700,
                message: 'Parse error',
            };

            return new Response(stringify(response), responseInit);
        }
        response.id = data?.id;

        let pathInfo = findPath(spec, data?.method);
        if (!pathInfo) {
            response.error = {
                code: -32600,
                message: 'Invalid Request',
            };

            return new Response(stringify(response), responseInit);
        }

        const url = `${networks[network]}${pathInfo.path}`;
        const apiRequest = rpcParams2Request(data?.params ?? [], pathInfo.spec, url, pathInfo.requestMethod);
        if (apiRequest instanceof Error) {
            response.error = {
                code: -32602,
                message: apiRequest.message,
            };

            return new Response(stringify(response), responseInit);
        }

        try {
            const apiResponse = await fetch(apiRequest);
            const result: any = await apiResponse.json();
            if (apiResponse.ok) {
                response.result = result;
                apiResponse.headers.forEach((value, key) => {
                    if (key.startsWith('x-aptos')) {
                        response[camelCase(key.slice(8))] = value;
                    }
                });
            } else if (apiResponse.status >= 400 && apiResponse.status < 600) {
                response.error = result;
            } else {
                response.error = {
                    code: -32000,
                    message: 'Server error',
                };
            }

            return new Response(stringify(response), responseInit);
        } catch (error) {
            response.error = {
                code: -32603,
                message: 'Internal error',
            };

            return new Response(stringify(response), responseInit);
        }
    },
};
