import { useMemo, useState } from 'react';
import {
  filterPublishedMaterialSummaries,
  type BookMaterialSummary,
} from '../../services/materialCatalog/bookEditor.service';
import './BookMaterialPicker.css';

interface BookMaterialPickerProps {
  readonly materials: readonly BookMaterialSummary[];
  readonly onAttach: (material: BookMaterialSummary) => void;
}

const searchableText = (material: BookMaterialSummary): string =>
  [
    material.title,
    material.materialKind,
    ...(material.testTypeIds ?? []),
  ]
    .join(' ')
    .toLowerCase();

const BookMaterialPicker = ({ materials, onAttach }: BookMaterialPickerProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const query = searchTerm.trim().toLowerCase();
  const publishedMaterials = useMemo(
    () =>
      filterPublishedMaterialSummaries(materials)
        .filter((material) => !query || searchableText(material).includes(query))
        .sort((left, right) => left.title.localeCompare(right.title)),
    [materials, query],
  );

  return (
    <div className="book-material-picker">
      <label className="book-material-picker__search">
        <span>Find published material</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search published materials"
        />
      </label>

      {publishedMaterials.length === 0 ? (
        <p className="book-material-picker__empty">No published materials available.</p>
      ) : (
        <ul className="book-material-picker__list">
          {publishedMaterials.map((material) => (
            <li className="book-material-picker__item" key={`${material.materialKind}:${material.materialId}`}>
              <div className="book-material-picker__summary">
                <strong>{material.title}</strong>
                <span>{material.materialKind}</span>
                {Boolean(material.testTypeIds?.length) && (
                  <span>{material.testTypeIds?.join(', ')}</span>
                )}
              </div>
              <button type="button" aria-label={`Attach ${material.title}`} onClick={() => onAttach(material)}>
                Attach
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BookMaterialPicker;
