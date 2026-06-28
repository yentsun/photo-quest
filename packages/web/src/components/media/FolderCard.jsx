import { memo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getThumbUrl, renameFolder } from '../../utils/api.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { Icon, IconButton } from '../ui/index.js';

export default memo(function FolderCard({ folder, onRemove }) {
  const navigate = useNavigate();
  const { bump } = useRefresh();
  const pathName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const [displayName, setDisplayName] = useState(folder.name || pathName);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const inputRef = useRef(null);
  const thumbnailUrl = folder.previewMediaId ? getThumbUrl(folder.previewMediaId) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  const startEdit = useCallback((e) => {
    e.stopPropagation();
    setNameInput(displayName);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayName]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed === displayName) return;
    const prev = displayName;
    setDisplayName(trimmed || pathName);
    try {
      await renameFolder(folder.id, trimmed || null);
      bump();
    } catch {
      setDisplayName(prev);
    }
  }, [editing, nameInput, displayName, pathName, folder.id, bump]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { setEditing(false); setNameInput(displayName); }
  }, [saveEdit, displayName]);

  return (
    <div className="folder-card" onClick={() => !editing && navigate(`/folder/${folder.id}`)}>
      <div className="folder-card-frame">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={displayName} loading="lazy" />
        ) : (
          <div className="folder-card-empty">
            <Icon name="folder" className="icon-2xl text-mut" />
          </div>
        )}

        <div className="folder-card-rename">
          <IconButton
            icon={<Icon name="edit" className="icon-sm" />}
            onClick={startEdit}
            label="Rename folder"
            size="sm"
            className="icon-btn-overlay"
          />
        </div>

        {onRemove && (
          <div className="folder-card-remove">
            <IconButton
              icon={<Icon name="close" className="icon-sm" />}
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              label="Remove folder"
              size="sm"
              className="icon-btn-overlay"
            />
          </div>
        )}
      </div>

      <div className="folder-card-meta">
        {editing ? (
          <input
            ref={inputRef}
            className="folder-rename-input"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <p className="folder-card-name">{displayName}</p>
        )}
        {(imageCount > 0 || videoCount > 0) && (
          <p className="folder-card-counts">
            {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
            {imageCount > 0 && videoCount > 0 && ', '}
            {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>
    </div>
  );
})
