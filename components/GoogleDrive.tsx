import React, { useState, useEffect, useContext } from 'react';
import { getDriveFiles } from '../services/drive';
import { AppContext } from '../App';

const GoogleDrive: React.FC = () => {
  const { accessToken } = useContext(AppContext)!;
  const [files, setFiles] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!accessToken) {
        setError('Please log in to view your Google Drive files.');
        return;
      }

      try {
        const driveFiles = await getDriveFiles(accessToken);
        setFiles(driveFiles || []);
      } catch (err) {
        setError('Error fetching files from Google Drive');
        console.error(err);
      }
    };

    fetchFiles();
  }, [accessToken]);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h1>Google Drive Files</h1>
      <ul>
        {files.map((file) => (
          <li key={file.id}>{file.name}</li>
        ))}
      </ul>
    </div>
  );
};

export default GoogleDrive;
