import type {
	IHookFunctions,
	IWebhookFunctions,
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { tallyApiRequest, getForms } from './GenericFunctions';

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
				displayOptions: {
					show: {
						authentication: ['accessToken'],
					},
				},
			},
			{
				name: 'tallyOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
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
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'Access Token',
						value: 'accessToken',
					},
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
				],
				default: 'accessToken',
			},
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
			getForms,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const webhookData = this.getWorkflowStaticData('node');
				const formId = this.getNodeParameter('formId') as string;

				const responseData = await tallyApiRequest.call(this, 'GET', '/webhooks', {}, {});

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
				const formId = this.getNodeParameter('formId') as string;

				const body = {
					formId,
					url: webhookUrl,
					eventTypes: ['FORM_RESPONSE'],
					externalSubscriber: 'N8N',
				};

				const responseData = await tallyApiRequest.call(this, 'POST', '/webhooks', body, {});

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
					const endpoint = `/webhooks/${webhookData.webhookId}`;

					try {
						await tallyApiRequest.call(this, 'DELETE', endpoint, {}, {});
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
		const bodyData = this.getBodyData() as unknown as IDataObject;

		return {
			workflowData: [[{ json: bodyData }]],
		};
	}
}
