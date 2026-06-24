export default function Loader({ message, className = '' }) {
  return (
    <div className={['loader', className].filter(Boolean).join(' ')}>
      <span className="loader-line">Loading...</span>
      {message && <p className="loader-msg">{message}</p>}
    </div>
  );
}
