import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChapterReader } from '../components/reader/ChapterReader';

/**
 * Full-screen chapter reader route (/read). Reads the chapter target from the query string and
 * renders the interactive PDF reader + AI Question Scanner.
 *   /read?notebookId=<nb>&sourceId=<chapter>&title=<chapter>&book=<book>&subject=<subject>
 */
export default function Reader() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const notebookId = sp.get('notebookId') || '';
  const sourceId = sp.get('sourceId') || '';
  const chapterTitle = sp.get('title') || undefined;
  const bookTitle = sp.get('book') || undefined;
  const subject = sp.get('subject') || undefined;

  if (!notebookId || !sourceId) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#0b0b0c] text-white">
        <p className="text-[14px] text-gray-400">No chapter selected to read.</p>
        <button onClick={() => navigate('/documents')} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[13px] font-semibold">
          Go to Documents
        </button>
      </div>
    );
  }

  return (
    <ChapterReader
      notebookId={notebookId}
      sourceId={sourceId}
      chapterTitle={chapterTitle}
      bookTitle={bookTitle}
      subject={subject}
      onBack={() => navigate(-1)}
    />
  );
}
