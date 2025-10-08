import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class TallyApi implements ICredentialType {
  name = 'tallyApi';

  displayName = 'Tally API';

  documentationUrl = 'https://developers.tally.so/api-reference/api-keys';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.tally.so',
    },
  ];
}
