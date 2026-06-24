import Loader from './Loader.jsx';

export default function PageLoader({ message }) {
  return (
    <div className="page-loader">
      <Loader message={message} />
    </div>
  );
}
