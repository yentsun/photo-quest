import { useEffect, useState } from 'react';
import Button from './ui/Button.jsx';
import Modal from './ui/Modal.jsx';
import { discoverServers } from '../server/discovery.js';
import './ServerFinder.css';

export default function ServerFinder({ open, onClose, onSelect }) {
  const [scanning, setScanning] = useState(false);
  const [servers, setServers] = useState([]);

  const scan = async () => {
    setScanning(true);
    setServers(await discoverServers());
    setScanning(false);
  };

  useEffect(() => { if (open) scan(); }, [open]);

  return (
    <Modal open={open} title="Look for server" onClose={onClose}>
      {scanning && <p className="finder__status">Scanning…</p>}

      {!scanning && servers.length === 0 && (
        <p className="finder__status">No servers found on local network.</p>
      )}

      {servers.length > 0 && (
        <ul className="finder__list">
          {servers.map(s => (
            <li key={s.url}>
              <button className="finder__item" onClick={() => onSelect(s)}>
                <span className="finder__host">{s.host}</span>
                <span className="finder__url">{s.url}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="finder__actions">
        <Button variant="secondary" size="sm" onClick={scan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>
    </Modal>
  );
}
