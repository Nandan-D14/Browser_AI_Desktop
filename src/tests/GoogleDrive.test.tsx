import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GoogleDrive from '../../components/GoogleDrive';
import * as driveService from '../../services/drive';

vi.mock('../../services/drive');

describe('GoogleDrive', () => {
  it('should render a list of files', async () => {
    const mockFiles = [
      { id: '1', name: 'File 1' },
      { id: '2', name: 'File 2' },
    ];
    vi.spyOn(driveService, 'getDriveFiles').mockResolvedValue(mockFiles);

    render(<GoogleDrive />);

    await waitFor(() => {
      expect(screen.getByText('File 1')).toBeInTheDocument();
      expect(screen.getByText('File 2')).toBeInTheDocument();
    });
  });

  it('should render an error message if fetching files fails', async () => {
    vi.spyOn(driveService, 'getDriveFiles').mockRejectedValue(new Error('Failed to fetch'));

    render(<GoogleDrive />);

    await waitFor(() => {
      expect(screen.getByText('Error fetching files from Google Drive')).toBeInTheDocument();
    });
  });
});
