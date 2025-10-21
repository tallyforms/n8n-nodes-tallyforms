import type {
  IHookFunctions,
  IWebhookFunctions,
  ILoadOptionsFunctions,
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  INodePropertyOptions,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionTypes } from 'n8n-workflow';

const BASE_URL = 'https://api.tally.so';

type ITallyAPIResponseForm = {
  id: string;
  name: string | null;
};

export class TallyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Tally Trigger',
    name: 'tallyTrigger',
    icon: { light: 'file:tally.svg', dark: 'file:tally.dark.svg' },
    group: ['trigger'],
    version: 1,
    subtitle: '=Form: {{$parameter["formId"]}}',
    description: 'Starts the workflow on a Tally form submission',
    defaults: {
      name: 'Tally Trigger',
    },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'tallyApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Form Name or ID',
        name: 'formId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getForms',
        },
        default: '',
        required: true,
        description:
          'The Tally form to monitor for new submissions. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
    ],
  };

  methods = {
    loadOptions: {
      async getForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'tallyApi', {
          url: `${BASE_URL}/forms`,
          method: 'GET',
          qs: { limit: 500 },
        });

        const data: ITallyAPIResponseForm[] = response?.items || response;
        if (!Array.isArray(data)) {
          throw new ApplicationError('No forms returned from Tally API', { level: 'warning' });
        }

        return data.map((form) => ({
          name: form.name || `Untitled form (${form.id})`,
          value: form.id,
        }));
      },
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const data = this.getWorkflowStaticData('node');
        const formId = this.getNodeParameter('formId');

        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'tallyApi', {
          url: `${BASE_URL}/webhooks`,
          method: 'GET',
        });

        if (!Array.isArray(response?.webhooks)) {
          return false;
        }

        for (const webhook of response.webhooks) {
          if (webhook.url === webhookUrl && webhook.formId === formId) {
            data.webhookId = webhook.id;
            return true;
          }
        }

        return false;
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const formId = this.getNodeParameter('formId');

        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'tallyApi', {
          url: `${BASE_URL}/webhooks`,
          method: 'POST',
          body: {
            formId,
            url: webhookUrl,
            eventTypes: ['FORM_RESPONSE'],
            externalSubscriber: 'N8N',
          },
          json: true,
        });

        if (!response?.id) {
          return false;
        }

        const data = this.getWorkflowStaticData('node');

        data.webhookId = response.id;

        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node');
        if (!data.webhookId) {
          return false;
        }

        await this.helpers.httpRequestWithAuthentication.call(this, 'tallyApi', {
          url: `${BASE_URL}/webhooks/${data.webhookId}`,
          method: 'DELETE',
        });

        delete data.webhookId;

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData();

    if (!body?.data || typeof body?.data !== 'object') {
      return {
        workflowData: [[{ json: body }]],
      };
    }

    const data = transformResponseData(body.data as TallyWebhookData);

    return {
      workflowData: [[{ json: data }]],
    };
  }
}

type TallyWebhookField = {
  key: string;
  value: string | string[] | IDataObject | null;
  type: string;
  options?: Array<{ id: string; text: string }>;
  columns?: Array<{ id: string; text: string }>;
};

type TallyWebhookData = {
  responseId: string;
  formId: string;
  formName: string;
  respondentId: string;
  createdAt: string;
  fields: TallyWebhookField[];
};

const transformResponseData = (data: TallyWebhookData): IDataObject => {
  const response: IDataObject = {
    id: data.responseId,
    formId: data.formId,
    formName: data.formName,
    respondentId: data.respondentId,
    createdAt: data.createdAt,
  };

  data.fields.forEach(({ key, value, type, options, columns }) => {
    if (['MULTIPLE_CHOICE', 'DROPDOWN'].includes(type)) {
      if (Array.isArray(value)) {
        const values: string[] = [];
        for (const x of value) {
          const option = options?.find((y) => y.id === x);
          if (option) {
            values.push(option.text);
          }
        }

        response[key] = values.join(',');
      } else {
        const option = options?.find((x) => x.id === value);
        response[key] = option ? option.text : null;
      }
      return;
    }

    if (['CHECKBOXES', 'RANKING', 'MULTI_SELECT'].includes(type) && Array.isArray(value)) {
      const values: string[] = [];
      for (const x of value) {
        const option = options?.find((y) => y.id === x);
        if (option) {
          values.push(option.text);
        }
      }

      response[key] = values.join(',');
      return;
    }

    if (['FILE_UPLOAD', 'SIGNATURE'].includes(type) && Array.isArray(value)) {
      const values: string[] = [];
      for (const x of value) {
        if (typeof x === 'object' && x !== null && 'url' in x) {
          values.push((x as { url: string }).url);
        }
      }

      response[key] = values.join(',');
      return;
    }

    if (type === 'MATRIX' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const x of Object.keys(value)) {
        const rowKey = `${key}_${x}`;
        const rowValue = value[x];
        if (Array.isArray(rowValue)) {
          response[rowKey] = rowValue
            .map((y) => columns?.find((z) => z.id === y)?.text ?? '')
            .join(',');
        }
      }
      return;
    }

    response[key] = value;
  });

  return response;
};
