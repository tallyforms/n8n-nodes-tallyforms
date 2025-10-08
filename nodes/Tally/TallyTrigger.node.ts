import type {
  IHookFunctions,
  IWebhookFunctions,
  ILoadOptionsFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  INodePropertyOptions,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionTypes } from 'n8n-workflow';

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
        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');

        const response = await this.helpers.httpRequest({
          url: `${baseUrl}/forms`,
          headers: { Authorization: `Bearer ${apiKey}` },
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

        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');
        const response = await this.helpers.httpRequest({
          url: `${baseUrl}/webhooks`,
          headers: { Authorization: `Bearer ${apiKey}` },
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

        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');
        const response = await this.helpers.httpRequest({
          url: `${baseUrl}/webhooks`,
          headers: { Authorization: `Bearer ${apiKey}` },
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

        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');
        await this.helpers.httpRequest({
          url: `${baseUrl}/webhooks/${data.webhookId}`,
          headers: { Authorization: `Bearer ${apiKey}` },
          method: 'DELETE',
        });

        delete data.webhookId;

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData();

    return {
      workflowData: [[{ json: body }]],
    };
  }
}
