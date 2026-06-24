import Spinner from './Spinner.jsx';

export default function PageLoader({ message }) {
  return (
    <div className="page-loader">
      <Spinner size="lg" />
      <p className="page-loader-msg">{message}</p>
    </div>
  );
}
