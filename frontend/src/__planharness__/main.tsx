// TEMPORARY visual harness for the agent study-plan view — delete after checking (not part of the app).
import { createRoot } from 'react-dom/client';
import '../index.css';
import StudyPlanView from '../components/chat/workspace/StudyPlanView';
import spec from './plan.json';

createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-6 flex justify-center">
    <div className="w-[560px] h-[1100px] rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#161616] overflow-hidden">
      <StudyPlanView spec={spec as any} />
    </div>
  </div>,
);
