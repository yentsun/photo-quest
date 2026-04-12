import './EmptyState.css';

export default function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state__icon">{icon}</div>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__text">{text}</p>
      {action}
    </div>
  );
}
