import { gapi } from 'gapi-script';

export const loadGapiScript = (accessToken: string) => {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      gapi.load('client', () => {
        gapi.client.init({
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        }).then(() => {
          gapi.client.setToken({ access_token: accessToken });
          resolve();
        }).catch(reject);
      });
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

export const getDriveFiles = async () => {
  const response = await gapi.client.drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  return response.result.files;
};
