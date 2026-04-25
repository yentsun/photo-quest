import './Spinner.css';

export default function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" aria-label={label || 'Loading'} />
      {label && <p className="spinner-label">{label}</p>}
    </div>
  );
}
