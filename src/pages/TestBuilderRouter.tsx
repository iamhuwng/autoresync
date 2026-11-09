import { useLocation } from 'react-router-dom';
import ListeningTestBuilder from '../skills/listening/builders/ListeningTestBuilder';
import WritingTestBuilder from './WritingTestBuilder';
import RetiredMaterialNoticePage from './RetiredMaterialNoticePage';

export default function TestBuilderRouter() {
  const skill = new URLSearchParams(useLocation().search).get('skill');

  if (skill === 'Listening') return <ListeningTestBuilder />;
  if (skill === 'Writing') return <WritingTestBuilder />;

  return <RetiredMaterialNoticePage audience="teacher" retiredFeature="material" />;
}
