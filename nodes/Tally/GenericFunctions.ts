import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IWebhookFunctions,
  INodePropertyOptions,
  JsonObject,
  IHttpRequestMethods,
  IRequestOptions,
} from 'n8n-workflow';
import { ApplicationError, NodeApiError } from 'n8n-workflow';

export async function tallyApiRequest(
  this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  query: IDataObject = {},
): Promise<any> {
  const credentials = await this.getCredentials<{ apiKey: string }>('tallyApi');

  const options: IRequestOptions = {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
    method,
    body,
    qs: query || {},
    uri: `https://api.tally.so${endpoint}`,
    json: true,
  };

  if (!Object.keys(body).length) {
    delete options.body;
  }

  try {
    return await this.helpers.request(options);
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

export async function getForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const response = await tallyApiRequest.call(this, 'GET', '/forms', {}, { limit: 500 });
  if (!Array.isArray(response?.items || response)) {
    throw new ApplicationError('No forms returned from Tally API', { level: 'warning' });
  }

  const data = response?.items || response;
  return data.map((form: IDataObject) => ({
    name: form.name || `Untitled form (${form.id})`,
    value: form.id,
  })) satisfies INodePropertyOptions[];
}
