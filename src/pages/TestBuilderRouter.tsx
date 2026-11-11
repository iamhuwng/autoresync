import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildRoute } from '../constants/routes';
import ListeningTestBuilder from '../skills/listening/builders/ListeningTestBuilder';
import WritingTestBuilder from './WritingTestBuilder';
import RetiredMaterialNoticePage from './RetiredMaterialNoticePage';

export const ExistingMaterialEditRedirect = ({ materialId }: { materialId: string }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(buildRoute('LOBBY'), {
      replace: true,
      state: { editMaterialId: materialId, editSource: 'material-profile' },
    });
  }, [materialId, navigate]);

  return null;
};

export default function TestBuilderRouter() {
  const search = new URLSearchParams(useLocation().search);
  const editMaterialId = search.get('edit');
  const skill = search.get('skill');

  if (editMaterialId) return <ExistingMaterialEditRedirect materialId={editMaterialId} />;

  if (skill === 'Listening') return <ListeningTestBuilder />;
  if (skill === 'Writing') return <WritingTestBuilder />;

  return <RetiredMaterialNoticePage audience="teacher" retiredFeature="material" />;
}
