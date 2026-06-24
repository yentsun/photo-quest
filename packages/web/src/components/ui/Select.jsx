export default function Select({ value, onChange, options, className = '', ...rest }) {
  return (
    <select
      className={['select', className].filter(Boolean).join(' ')}
      value={value}
      onChange={onChange}
      {...rest}
    >
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}
