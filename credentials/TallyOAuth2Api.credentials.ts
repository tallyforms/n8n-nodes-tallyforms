import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class TallyOAuth2Api implements ICredentialType {
  name = 'tallyOAuth2Api';

  extends = ['oAuth2Api'];

  displayName = 'Tally OAuth2 API';

  documentationUrl = 'https://tally.so/help/n8n';

  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'authorizationCode',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      default: 'https://tally.so/oauth/authorize',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: 'https://api.tally.so/oauth/token',
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'user forms responses webhooks',
    },
    {
      displayName: 'Auth URI Query Parameters',
      name: 'authQueryParameters',
      type: 'hidden',
      default: '',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'header',
    },
  ];
}
