import { supabase } from '@/lib/supabase';

export type AdminReport = {
  report_id: string;
  kind: 'profile' | 'avatar';
  reason: string;
  created_at: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string | null;
  reported_name: string | null;
  reported_username: string | null;
  reported_avatar: string | null;
};

export async function fetchAdminReports(demoMode: boolean): Promise<AdminReport[]> {
  if (demoMode || !supabase) return [];
  const { data } = await supabase.rpc('admin_reports');
  return (data ?? []) as AdminReport[];
}

export async function fetchReportCount(demoMode: boolean): Promise<number> {
  if (demoMode || !supabase) return 0;
  const { data } = await supabase.rpc('admin_report_count');
  return typeof data === 'number' ? data : 0;
}

export async function resolveReport(demoMode: boolean, id: string, removeAvatar: boolean) {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('admin_resolve_report', { p_report: id, p_remove_avatar: removeAvatar });
  if (error) throw new Error(error.message);
}
