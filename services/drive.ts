import { google } from 'googleapis';

export const getDriveFiles = async (accessToken: string) => {
  if (!accessToken) {
    throw new Error('No access token provided');
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });

  return res.data.files;
};
