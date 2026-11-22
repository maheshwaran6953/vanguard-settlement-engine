import { apiClient } from './client';
import { FailedJobsData, AdminActionResponse } from './types';

export async function getFailedJobs(): Promise<FailedJobsData> {
  return apiClient.get<FailedJobsData>('/admin/failed-jobs');
}

export async function retryFailedJob(queue: string, jobId: string): Promise<AdminActionResponse> {
  return apiClient.post<AdminActionResponse>(`/admin/failed-jobs/${queue}/${jobId}/retry`);
}

export async function discardFailedJob(queue: string, jobId: string): Promise<AdminActionResponse> {
  return apiClient.delete<AdminActionResponse>(`/admin/failed-jobs/${queue}/${jobId}`);
}
