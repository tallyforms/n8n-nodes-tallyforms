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
        const webhookData = this.getWorkflowStaticData('node');
        const formId = this.getNodeParameter('formId');

        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');

        const responseData = await this.helpers.httpRequest({
          url: `${baseUrl}/webhooks`,
          headers: { Authorization: `Bearer ${apiKey}` },
          method: 'GET',
        });

        if (responseData && responseData.webhooks) {
          for (const webhook of responseData.webhooks) {
            if (webhook.url === webhookUrl && webhook.formId === formId) {
              webhookData.webhookId = webhook.id;
              return true;
            }
          }
        }

        return false;
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const formId = this.getNodeParameter('formId');

        const { apiKey, baseUrl } = await this.getCredentials('tallyApi');

        const body = {
          formId,
          url: webhookUrl,
          eventTypes: ['FORM_RESPONSE'],
          externalSubscriber: 'N8N',
        };

        const responseData = await this.helpers.httpRequest({
          url: `${baseUrl}/webhooks`,
          headers: { Authorization: `Bearer ${apiKey}` },
          method: 'POST',
          body,
          json: true,
        });

        if (responseData.id === undefined) {
          return false;
        }

        const webhookData = this.getWorkflowStaticData('node');
        webhookData.webhookId = responseData.id;
        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');

        if (webhookData.webhookId !== undefined) {
          const { apiKey, baseUrl } = await this.getCredentials('tallyApi');

          try {
            await this.helpers.httpRequest({
              url: `${baseUrl}/webhooks/${webhookData.webhookId}`,
              headers: { Authorization: `Bearer ${apiKey}` },
              method: 'DELETE',
            });
          } catch (e) {
            return false;
          }

          delete webhookData.webhookId;
        }

        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const bodyData = this.getBodyData();

    return {
      workflowData: [[{ json: bodyData }]],
    };
  }
}
