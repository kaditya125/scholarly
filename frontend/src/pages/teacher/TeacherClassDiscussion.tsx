import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useClass } from '../../hooks/api/useClasses';
import ClassFeed from '../../components/ClassFeed';

/** /teach/classes/:id/discussion — post announcements, and see/reply to student discussion. */
export default function TeacherClassDiscussion() {
  const { id } = useParams<{ id: string }>();
  const { data: record } = useClass(id);

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teach/classes/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record?.title || 'Class'}
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Discussion</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Post an announcement, or reply to what students are asking.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 sm:p-6">
        {id && <ClassFeed classId={id} viewerRole="teacher" />}
      </div>
    </div>
  );
}
