export default function Loader({ message, className = '' }) {
  return (
    <div className={['loader', className].filter(Boolean).join(' ')}>
      <span className="loader-line">Loading...<span className="spinner" /></span>
      {message && <p className="loader-msg">{message}</p>}
    </div>
  );
}
